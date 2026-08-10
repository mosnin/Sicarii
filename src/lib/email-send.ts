// The send chokepoint. The ONLY way an outbound email leaves Scalar, and the
// one place every rule that makes sending safe is enforced, in order, before a
// single byte reaches a recipient:
//
//   1. a connected, ACTIVE Gmail mailbox exists (else there is nothing to send
//      from, and we say so rather than pretending)
//   2. the recipient is not suppressed (OUTBOUND or ALL) - a hard refusal
//   3. the mailbox is under its daily send cap and inside its send window -
//      deliverability governance, so unattended volume cannot torch the domain
//   4. the balance can cover the send (pre-flight, so an out-of-credits caller
//      is stopped before the provider is touched)
//   5. an unsubscribe link + List-Unsubscribe header are attached (CAN-SPAM and
//      the Google/Yahoo bulk-sender one-click requirement)
//
// Only then does it send, and only on a confirmed send does it debit credits,
// record the EmailMessage, and advance the contact. Every caller - the MCP
// send_email tool, breakup-draft approval, a future autopilot step - goes
// through here, so none of them can skip a rule.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { getConnection } from "@/lib/connections";
import { executeSendEmail, isComposioConfigured } from "@/lib/composio";
import { assertNotSuppressed } from "@/lib/suppression";
import { buildUnsubscribe } from "@/lib/unsubscribe";
import { ensureCredits, spendCreditsAmount, CREDIT_COSTS } from "@/lib/credits";
import { logOutreach } from "@/lib/crm-operations";

/** The fully-warmed daily ceiling per mailbox. Override with EMAIL_DAILY_CAP.
 *  Guard on the TRUNCATED value so a fractional env like "0.5" cannot pass a
 *  raw > 0 check and then truncate to 0, locking out all sending. */
function configuredCap(): number {
  const n = Math.trunc(Number(process.env.EMAIL_DAILY_CAP));
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/**
 * Warmup-aware daily cap. A brand-new mailbox that suddenly sends its full
 * ceiling looks like spam to the receiving providers and burns the sending
 * domain's reputation, which is slow and expensive to recover. So the cap
 * starts low and ramps: EMAIL_WARMUP_START on day 0, growing EMAIL_WARMUP_STEP
 * per day since the mailbox connected, up to the configured ceiling. A mailbox
 * with no known connect date is treated as fully warmed (conservative for an
 * existing install, and the only safe default when the date is missing).
 *
 * Exported and pure so the ramp is unit-testable without the send path.
 */
export function warmupDailyCap(connectedAt: Date | null, now: Date = new Date()): number {
  const ceiling = configuredCap();
  if (!connectedAt) return ceiling;
  const start = Math.trunc(Number(process.env.EMAIL_WARMUP_START));
  const step = Math.trunc(Number(process.env.EMAIL_WARMUP_STEP));
  const base = Number.isFinite(start) && start > 0 ? start : 20;
  const perDay = Number.isFinite(step) && step > 0 ? step : 10;
  const days = Math.max(0, Math.floor((now.getTime() - connectedAt.getTime()) / (24 * 60 * 60 * 1000)));
  return Math.min(ceiling, base + days * perDay);
}

/** Send-window guard in the mailbox owner's configured hours. Kept simple: a
 *  start and end hour in a fixed timezone offset, both env-driven, defaulting
 *  to always-open so a deploy that has not configured hours is not silently
 *  blocked. Returns null when open, or a reason string when closed. */
function outsideSendWindow(now: Date): string | null {
  const start = Number(process.env.EMAIL_SEND_WINDOW_START_HOUR);
  const end = Number(process.env.EMAIL_SEND_WINDOW_END_HOUR);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null; // not configured = always open
  const offset = Number(process.env.EMAIL_SEND_WINDOW_UTC_OFFSET) || 0;
  const localHour = (((now.getUTCHours() + offset) % 24) + 24) % 24;
  const open = start <= end ? localHour >= start && localHour < end : localHour >= start || localHour < end;
  return open ? null : `outside the configured send window (${start}:00-${end}:00)`;
}

export class NoMailboxError extends OpError {
  constructor() {
    super("No connected Gmail mailbox to send from. Connect one in Settings first.", 501);
    this.name = "NoMailboxError";
  }
}
export class SendCapError extends OpError {
  constructor(cap: number) {
    super(`Daily send cap reached (${cap} emails). This protects your sending domain; it resets tomorrow.`, 429);
    this.name = "SendCapError";
  }
}
export class SendWindowError extends OpError {
  constructor(reason: string) {
    super(`Not sent: ${reason}. It will go out inside the window.`, 425);
    this.name = "SendWindowError";
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain-text body. The unsubscribe footer is appended here before sending. */
  body: string;
  /** The contact this is to, so the send advances their pipeline state and the
   *  message links to their record. Optional for a one-off, but strongly
   *  preferred: without it the message is not attributed to anyone. */
  contactId?: string | null;
  /** From select_variant, threaded to logOutreach for bandit attribution. */
  variantId?: string | null;
  /** Skip the daily cap and window - reserved for a human-initiated one-off
   *  from the UI, never for unattended sending. Defaults false. */
  bypassGovernance?: boolean;
}

export interface SendEmailResult {
  sent: true;
  providerMessageId: string | null;
  emailMessageId: string;
  charged: number;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Send one outbound email, enforcing every rule above. Throws a specific,
 * catchable error at whichever gate refuses (suppressed, capped, no mailbox,
 * out of credits) so a caller can tell the operator exactly why nothing went.
 */
export async function sendOutboundEmail(userId: string, input: SendEmailInput): Promise<SendEmailResult> {
  if (!isComposioConfigured()) throw new NoMailboxError();

  const to = input.to?.trim();
  if (!to || !to.includes("@")) throw new OpError("A valid recipient email is required.", 400);
  // Strip CR/LF from the subject: cheap defense against header injection even
  // though the send is via the Gmail API JSON field, not raw SMTP.
  const subject = (input.subject?.replace(/[\r\n]+/g, " ").trim()) || "(no subject)";
  const body = input.body?.trim();
  if (!body) throw new OpError("An email body is required.", 400);

  // 1. Mailbox.
  const mailbox = await getConnection(userId, "GMAIL");
  if (!mailbox || mailbox.status !== "ACTIVE" || !mailbox.composioConnectionId) throw new NoMailboxError();

  // 2. Suppression. Hard refusal, ahead of everything paid or stateful.
  await assertNotSuppressed(userId, to, "outbound");

  // 3. Deliverability governance (skippable only for a human one-off).
  if (!input.bypassGovernance) {
    const now = new Date();
    const windowReason = outsideSendWindow(now);
    if (windowReason) throw new SendWindowError(windowReason);
    // Warmup ramp: the cap grows from a low base over the mailbox's first weeks.
    const cap = warmupDailyCap(mailbox.connectedAt ?? mailbox.createdAt ?? null, now);
    const sentToday = await prisma.emailMessage.count({
      where: { userId, direction: "OUTBOUND", sentAt: { gte: startOfUtcDay(now) } },
    });
    if (sentToday >= cap) throw new SendCapError(cap);
  }

  // 4. Credits pre-flight (real debit only after a confirmed send).
  await ensureCredits(userId, "email_send");

  // 5. Unsubscribe. Attach the header + append the footer to the body.
  const unsub = buildUnsubscribe({ userId, email: to });
  if (!unsub.url) {
    // No signing secret: refuse rather than send a non-compliant email. A silent
    // send with no opt-out is the exact thing the acceptable-use promise forbids.
    throw new OpError("Cannot send: no unsubscribe secret configured (UNSUBSCRIBE_SECRET or a server secret).", 501);
  }
  const finalBody = `${body}\n\n--\n${unsub.footerText}`;

  // Composio's GMAIL_SEND_EMAIL argument names are passed through. recipient
  // and body naming could not be verified fully offline, so the extra_headers
  // path carries List-Unsubscribe; if a deploy finds a mismatch it surfaces as
  // a provider error here, the diagnosable place, not a silent drop.
  const result = await executeSendEmail({
    userId,
    connectedAccountId: mailbox.composioConnectionId,
    arguments: {
      recipient_email: to,
      subject,
      body: finalBody,
      is_html: false,
      extra_headers: {
        "List-Unsubscribe": unsub.listUnsubscribeHeader,
        "List-Unsubscribe-Post": unsub.listUnsubscribePostHeader,
      },
    },
  });
  if (result.successful === false || result.error) {
    throw new OpError(`Send failed: ${result.error ?? "the mail provider rejected it"}`, 502);
  }

  const providerMessageId =
    (typeof result.data?.id === "string" && result.data.id) ||
    (typeof result.data?.message_id === "string" && (result.data.message_id as string)) ||
    null;

  // Debit on the confirmed send, but NEVER throw here: the email has physically
  // gone out, so a shortfall (the balance drained between the pre-flight
  // ensureCredits above and now, under concurrency) must not lose the record or
  // report a delivered send as a failure. spendCreditsAmount returns a boolean;
  // an uncovered debit is logged, not raised. The pre-flight is the real gate.
  const debited = await spendCreditsAmount(userId, CREDIT_COSTS.email_send, "email_send", { ref: input.contactId ?? to });
  if (!debited) console.warn(`[email-send] delivered but could not debit ${CREDIT_COSTS.email_send} credits for ${userId}`);

  // Record the sent message so it shows in the same synced store as inbound
  // mail, and advance the contact's pipeline state for real. An outbound send
  // opens (or extends) a thread; we key it by the provider message id when we
  // have one, falling back to a synthetic id so the row is never lost.
  const emailMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const thread = await tx.emailThread.create({
      data: {
        userId,
        providerThreadId: providerMessageId ?? `sent:${Date.now()}:${to}`,
        subject,
        participants: [to],
        firstMessageAt: new Date(),
        lastMessageAt: new Date(),
        messageCount: 1,
        contactId: input.contactId ?? null,
      },
    });
    return tx.emailMessage.create({
      data: {
        userId,
        threadId: thread.id,
        providerMessageId: providerMessageId ?? `sent:${thread.id}`,
        direction: "OUTBOUND",
        fromEmail: mailbox.accountEmail ?? "me",
        toEmails: [to],
        subject,
        snippet: body.slice(0, 200),
        bodyText: finalBody,
        sentAt: new Date(),
        contactId: input.contactId ?? null,
      },
    });
  });

  if (input.contactId) {
    await logOutreach(userId, {
      contactId: input.contactId,
      summary: `Email sent: "${subject}"`,
      channel: "email",
      variantId: input.variantId ?? undefined,
    });
  }

  return { sent: true, providerMessageId, emailMessageId: emailMessage.id, charged: 4 };
}
