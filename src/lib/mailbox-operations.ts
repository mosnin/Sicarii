// Agent mailboxes: the ops layer REST, MCP, and the in-app agent all share.
// A mailbox is the agent's sending identity. Purchase (Stripe + Premium
// Inboxes / GoDaddy) and BYOK SMTP both land here. Send is real delivery
// when credentials exist; otherwise we fail honestly instead of logging a
// fake send. See docs/decisions/0015-agent-mailboxes.md.

import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { logOutreach, saveEmail } from "@/lib/crm-operations";
import { ensureCredits, spendCredits } from "@/lib/credits";
import {
  encryptSmtpSecret,
  mailboxCryptoConfigured,
  smtpLast4,
  type SmtpSecret,
} from "@/lib/mailbox-crypto";
import {
  dailySendLimitForWarmupDay,
  mailboxIsSendReady,
  remainingSendsToday,
  sameUtcDay,
  shouldPromoteToReady,
  warmupDayFromStart,
} from "@/lib/mailbox-warmup";
import { draftColdOutreach, outreachLooksHealthy, type ColdDraft } from "@/lib/mailbox-draft";
import {
  checkDomainAvailability,
  godaddyConfigured,
  isPlausibleDomain,
  suggestDomains,
} from "@/lib/godaddy";
import { placeInboxOrder } from "@/lib/premium-inboxes";
import { birdConfigured, sendViaAgentMail, sendViaBird, sendViaSmtpCiphertext } from "@/lib/mailbox-send";

const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i;

export type MailboxProvider = "premium_inboxes" | "smtp" | "agentmail" | "bird";
export type MailboxStatus = "requested" | "provisioning" | "warming" | "ready" | "paused" | "failed";

export type PublicMailbox = {
  id: string;
  email: string;
  displayName: string | null;
  provider: string;
  status: string;
  domainId: string | null;
  domainName: string | null;
  warmupDay: number;
  dailySendLimit: number;
  sentToday: number;
  remainingToday: number;
  warmupStartedAt: Date | null;
  smtpLast4: string | null;
  lastError: string | null;
  createdAt: Date;
};

function toPublic(
  row: {
    id: string;
    email: string;
    displayName: string | null;
    provider: string;
    status: string;
    domainId: string | null;
    warmupDay: number;
    dailySendLimit: number;
    sentToday: number;
    sentTodayOn: Date | null;
    warmupStartedAt: Date | null;
    smtpLast4: string | null;
    lastError: string | null;
    createdAt: Date;
    domain?: { name: string } | null;
  },
  now = new Date(),
): PublicMailbox {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    provider: row.provider,
    status: row.status,
    domainId: row.domainId,
    domainName: row.domain?.name ?? null,
    warmupDay: row.warmupDay,
    dailySendLimit: row.dailySendLimit,
    sentToday: sameUtcDay(row.sentTodayOn, now) ? row.sentToday : 0,
    remainingToday: remainingSendsToday({
      sentToday: row.sentToday,
      sentTodayOn: row.sentTodayOn,
      dailySendLimit: row.dailySendLimit,
      now,
    }),
    warmupStartedAt: row.warmupStartedAt,
    smtpLast4: row.smtpLast4,
    lastError: row.lastError,
    createdAt: row.createdAt,
  };
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function assertLocalPart(localPart: string): string {
  const local = localPart.trim().toLowerCase();
  if (!LOCAL_PART.test(local)) throw new OpError("localPart must be a simple mailbox name (letters, numbers, . _ -).", 400);
  return local;
}

async function assertMailboxOwned(userId: string, mailboxId: string) {
  const box = await prisma.mailbox.findUnique({
    where: { id: mailboxId },
    include: { domain: { select: { name: true } } },
  });
  if (!box || box.userId !== userId) throw new OpError("Mailbox not found", 404);
  return box;
}

export async function listMailboxes(userId: string): Promise<PublicMailbox[]> {
  const rows = await prisma.mailbox.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { domain: { select: { name: true } } },
  });
  return rows.map((row) => toPublic(row));
}

export async function getMailbox(userId: string, mailboxId: string): Promise<PublicMailbox> {
  return toPublic(await assertMailboxOwned(userId, mailboxId));
}

export async function listDomains(userId: string) {
  return prisma.domain.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { mailboxes: true } } },
  });
}

export async function searchDomainsForUser(query: string) {
  const q = query.trim();
  if (!q) throw new OpError("query is required", 400);
  if (!godaddyConfigured()) {
    throw new OpError(
      "GoDaddy is not configured. Set GODADDY_API_KEY + GODADDY_API_SECRET (or GODADDY_PAT) to search live availability, or add a domain you already own.",
      501,
    );
  }
  if (isPlausibleDomain(q)) {
    const availability = await checkDomainAvailability(q);
    const suggestions = await suggestDomains(q.split(".")[0] ?? q, 6).catch(() => []);
    return { availability, suggestions };
  }
  const suggestions = await suggestDomains(q, 8);
  return { availability: null, suggestions };
}

export async function addOwnedDomain(userId: string, name: string) {
  if (!isPlausibleDomain(name)) throw new OpError("That does not look like a domain.", 400);
  const domain = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  try {
    return await prisma.domain.create({
      data: { userId, name: domain, registrar: "external", status: "active" },
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2002") throw new OpError("That domain is already on this workspace.", 409);
    throw e;
  }
}

export async function recordPurchasingDomain(userId: string, name: string, stripeSessionId?: string) {
  if (!isPlausibleDomain(name)) throw new OpError("That does not look like a domain.", 400);
  const domain = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const existing = await prisma.domain.findUnique({ where: { userId_name: { userId, name: domain } } });
  if (existing) {
    return prisma.domain.update({
      where: { id: existing.id },
      data: { status: "purchasing", stripeSessionId: stripeSessionId ?? existing.stripeSessionId, lastError: null },
    });
  }
  return prisma.domain.create({
    data: {
      userId,
      name: domain,
      registrar: "godaddy",
      status: "purchasing",
      stripeSessionId: stripeSessionId ?? null,
    },
  });
}

export async function markDomainActive(userId: string, domainId: string) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain || domain.userId !== userId) throw new OpError("Domain not found", 404);
  return prisma.domain.update({ where: { id: domainId }, data: { status: "active", lastError: null } });
}

export async function connectSmtpMailbox(
  userId: string,
  input: {
    email: string;
    displayName?: string;
    smtp: SmtpSecret;
    alreadyWarm?: boolean;
    domainId?: string;
  },
) {
  if (!mailboxCryptoConfigured()) {
    throw new OpError("Mailbox credential encryption is not configured.", 501);
  }
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new OpError("email must be a full address.", 400);
  if (input.domainId) {
    const domain = await prisma.domain.findUnique({ where: { id: input.domainId } });
    if (!domain || domain.userId !== userId) throw new OpError("Domain not found", 404);
  }
  const now = new Date();
  const warming = !input.alreadyWarm;
  const ciphertext = encryptSmtpSecret(input.smtp);
  try {
    const row = await prisma.mailbox.create({
      data: {
        userId,
        email,
        displayName: input.displayName?.trim() || null,
        provider: "smtp",
        status: warming ? "warming" : "ready",
        domainId: input.domainId ?? null,
        warmupStartedAt: warming ? now : null,
        warmupDay: warming ? 1 : WARM_READY,
        dailySendLimit: warming ? dailySendLimitForWarmupDay(1) : 40,
        smtpCiphertext: ciphertext,
        smtpLast4: smtpLast4(input.smtp.username),
      },
      include: { domain: { select: { name: true } } },
    });
    await prisma.mailboxEvent.create({
      data: { mailboxId: row.id, kind: "provision", meta: { via: "smtp", alreadyWarm: Boolean(input.alreadyWarm) } },
    });
    return toPublic(row, now);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2002") throw new OpError("That mailbox is already connected.", 409);
    throw e;
  }
}

const WARM_READY = 21;

export async function requestPurchasedMailbox(
  userId: string,
  input: {
    localPart: string;
    domainId?: string;
    domainName?: string;
    displayName?: string;
    stripeSessionId?: string;
    stripeSubscriptionId?: string;
  },
) {
  const local = assertLocalPart(input.localPart);
  let domain = input.domainId
    ? await prisma.domain.findUnique({ where: { id: input.domainId } })
    : input.domainName
      ? await prisma.domain.findUnique({
          where: { userId_name: { userId, name: input.domainName.trim().toLowerCase() } },
        })
      : null;
  if (input.domainId && (!domain || domain.userId !== userId)) {
    throw new OpError("Domain not found", 404);
  }
  if (!domain && input.domainName && isPlausibleDomain(input.domainName)) {
    domain = await addOwnedDomain(userId, input.domainName);
  }
  if (!domain) throw new OpError("Pick a domain first (buy or add one you own).", 400);

  const email = `${local}@${domain.name}`;
  const order = await placeInboxOrder({
    userId,
    domain: domain.name,
    localPart: local,
    displayName: input.displayName,
  });

  try {
    const row = await prisma.mailbox.create({
      data: {
        userId,
        domainId: domain.id,
        email: order.email ?? email,
        displayName: input.displayName?.trim() || null,
        provider: "premium_inboxes",
        status: order.status === "submitted" ? "provisioning" : "requested",
        stripeSessionId: input.stripeSessionId ?? null,
        stripeSubscriptionId: input.stripeSubscriptionId ?? null,
        providerOrderId: order.orderId,
        lastError: order.status === "pending_fulfillment" ? order.detail : null,
      },
      include: { domain: { select: { name: true } } },
    });
    await prisma.mailboxEvent.create({
      data: {
        mailboxId: row.id,
        kind: "provision",
        meta: { via: "premium_inboxes", orderId: order.orderId, status: order.status },
      },
    });
    return { mailbox: toPublic(row), order };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2002") throw new OpError("That mailbox already exists on this workspace.", 409);
    throw e;
  }
}

export async function fulfillMailboxProvision(input: {
  orderId?: string;
  mailboxId?: string;
  email: string;
  smtp?: SmtpSecret;
  providerInboxId?: string;
}) {
  const box = input.mailboxId
    ? await prisma.mailbox.findUnique({ where: { id: input.mailboxId } })
    : input.orderId
      ? await prisma.mailbox.findFirst({ where: { providerOrderId: input.orderId } })
      : null;
  if (!box) throw new OpError("Mailbox order not found", 404);

  const now = new Date();
  const ciphertext = input.smtp && mailboxCryptoConfigured() ? encryptSmtpSecret(input.smtp) : undefined;
  const updated = await prisma.mailbox.update({
    where: { id: box.id },
    data: {
      email: normalizeEmail(input.email),
      status: "warming",
      warmupStartedAt: box.warmupStartedAt ?? now,
      warmupDay: box.warmupDay > 0 ? box.warmupDay : 1,
      dailySendLimit: dailySendLimitForWarmupDay(1),
      providerInboxId: input.providerInboxId ?? box.providerInboxId,
      smtpCiphertext: ciphertext ?? box.smtpCiphertext,
      smtpLast4: input.smtp ? smtpLast4(input.smtp.username) : box.smtpLast4,
      lastError: null,
    },
    include: { domain: { select: { name: true } } },
  });
  await prisma.mailboxEvent.create({
    data: { mailboxId: box.id, kind: "provision", meta: { via: "webhook", email: input.email } },
  });
  return toPublic(updated, now);
}

export async function pauseMailbox(userId: string, mailboxId: string) {
  const box = await assertMailboxOwned(userId, mailboxId);
  if (box.status === "paused") return toPublic(box);
  const updated = await prisma.mailbox.update({
    where: { id: mailboxId },
    data: { status: "paused" },
    include: { domain: { select: { name: true } } },
  });
  await prisma.mailboxEvent.create({ data: { mailboxId, kind: "pause" } });
  return toPublic(updated);
}

export async function resumeMailbox(userId: string, mailboxId: string) {
  const box = await assertMailboxOwned(userId, mailboxId);
  if (box.status !== "paused") throw new OpError("Only a paused mailbox can be resumed.", 400);
  const next = box.warmupDay >= WARM_READY || box.smtpCiphertext ? (box.warmupDay >= WARM_READY ? "ready" : "warming") : "requested";
  const updated = await prisma.mailbox.update({
    where: { id: mailboxId },
    data: { status: next },
    include: { domain: { select: { name: true } } },
  });
  await prisma.mailboxEvent.create({ data: { mailboxId, kind: "resume", meta: { status: next } } });
  return toPublic(updated);
}

export async function markMailboxReady(userId: string, mailboxId: string) {
  const box = await assertMailboxOwned(userId, mailboxId);
  const updated = await prisma.mailbox.update({
    where: { id: box.id },
    data: { status: "ready", dailySendLimit: 40, lastError: null },
    include: { domain: { select: { name: true } } },
  });
  await prisma.mailboxEvent.create({ data: { mailboxId, kind: "provision", meta: { via: "mark_ready" } } });
  return toPublic(updated);
}

async function pickMailbox(userId: string, mailboxId?: string | null) {
  if (mailboxId) return assertMailboxOwned(userId, mailboxId);
  const ready = await prisma.mailbox.findFirst({
    where: { userId, status: "ready" },
    orderBy: { createdAt: "asc" },
    include: { domain: { select: { name: true } } },
  });
  if (ready) return ready;
  throw new OpError("No ready mailbox. Buy or connect one on /mailboxes, or wait for warmup to finish.", 409);
}

async function consumeSendSlot(box: { id: string; sentToday: number; sentTodayOn: Date | null; dailySendLimit: number }, now: Date) {
  const remaining = remainingSendsToday({
    sentToday: box.sentToday,
    sentTodayOn: box.sentTodayOn,
    dailySendLimit: box.dailySendLimit,
    now,
  });
  if (remaining <= 0) {
    throw new OpError(`Daily send cap reached (${box.dailySendLimit}). Try again tomorrow or wait for warmup to raise the cap.`, 429);
  }
  const reset = !sameUtcDay(box.sentTodayOn, now);
  await prisma.mailbox.update({
    where: { id: box.id },
    data: {
      sentToday: reset ? 1 : { increment: 1 },
      sentTodayOn: now,
    },
  });
}

async function deliver(box: {
  provider: string;
  email: string;
  displayName: string | null;
  smtpCiphertext: string | null;
  providerInboxId: string | null;
  userId: string;
}, message: { to: string; subject: string; text: string }) {
  const payload = {
    from: box.email,
    fromName: box.displayName,
    to: message.to,
    subject: message.subject,
    text: message.text,
    replyTo: box.email,
  };
  if (box.provider === "smtp" || box.smtpCiphertext) {
    if (!box.smtpCiphertext) throw new OpError("This mailbox has no SMTP credentials yet. Connect them when the inbox is provisioned.", 409);
    return sendViaSmtpCiphertext(box.smtpCiphertext, payload);
  }
  if (box.provider === "agentmail") {
    const user = await prisma.user.findUnique({ where: { id: box.userId }, select: { agentMailApiKey: true } });
    if (!user?.agentMailApiKey) throw new OpError("Connect an AgentMail key in Settings to send from this mailbox.", 409);
    const inboxId = box.providerInboxId ?? box.email;
    return sendViaAgentMail(user.agentMailApiKey, inboxId, payload);
  }
  if (box.provider === "bird") {
    if (!birdConfigured()) throw new OpError("Bird is not configured on this deployment.", 501);
    return sendViaBird(payload);
  }
  throw new OpError("This mailbox cannot send yet. It is still being provisioned.", 409);
}

export async function sendOutreachEmail(
  userId: string,
  input: {
    contactId: string;
    subject: string;
    body: string;
    mailboxId?: string;
    variantId?: string | null;
    allowWarming?: boolean;
  },
) {
  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  const to = contact.email?.trim();
  if (!to) throw new OpError("This contact has no email. Enrich them first.", 400);

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new OpError("subject and body are required.", 400);
  if (subject.length > 200) throw new OpError("subject is too long.", 400);
  if (body.length > 20_000) throw new OpError("body is too long.", 400);

  const box = await pickMailbox(userId, input.mailboxId);
  const now = new Date();
  const ready = mailboxIsSendReady(box.status, box.warmupDay);
  if (box.status === "paused" || box.status === "failed" || box.status === "requested" || box.status === "provisioning") {
    throw new OpError(`Mailbox ${box.email} is ${box.status} and cannot send yet.`, 409);
  }
  if (!ready && !input.allowWarming) {
    throw new OpError(
      `Mailbox ${box.email} is still warming (day ${box.warmupDay}). Wait until day 21 or mark it ready if this inbox is already warm.`,
      409,
    );
  }

  await ensureCredits(userId, "send_email");
  await consumeSendSlot(box, now);
  let delivered;
  try {
    delivered = await deliver(box, { to, subject, text: body });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed.";
    await prisma.mailbox.update({ where: { id: box.id }, data: { lastError: message.slice(0, 500) } });
    throw new OpError(message, 502);
  }

  const saved = await saveEmail(userId, {
    contactId: contact.id,
    direction: "OUTBOUND",
    subject,
    body,
    fromAddr: box.email,
    toAddr: to,
    mailboxId: box.id,
    agentMailMessageId: delivered.providerId ?? null,
    sentAt: now,
    savedAsContext: true,
  });
  await logOutreach(userId, {
    contactId: contact.id,
    summary: subject,
    channel: "email",
    variantId: input.variantId ?? null,
  });
  await prisma.mailboxEvent.create({
    data: {
      mailboxId: box.id,
      kind: "outreach",
      contactId: contact.id,
      toAddr: to,
      subject,
      providerId: delivered.providerId ?? null,
    },
  });
  await prisma.mailbox.update({ where: { id: box.id }, data: { lastError: null } });
  await spendCredits(userId, "send_email", { ref: saved.id });

  return {
    mailboxId: box.id,
    from: box.email,
    to,
    subject,
    emailId: saved.id,
    providerId: delivered.providerId ?? null,
    warnings: outreachLooksHealthy(subject, body),
  };
}

export async function recordInboundReply(
  userId: string,
  input: {
    contactId: string;
    mailboxId?: string;
    subject?: string;
    body: string;
    fromAddr: string;
    toAddr?: string;
    providerId?: string;
  },
) {
  const saved = await saveEmail(userId, {
    contactId: input.contactId,
    direction: "INBOUND",
    subject: input.subject ?? null,
    body: input.body,
    fromAddr: input.fromAddr,
    toAddr: input.toAddr ?? null,
    mailboxId: input.mailboxId ?? null,
    agentMailMessageId: input.providerId ?? null,
    savedAsContext: true,
    sentAt: new Date(),
  });
  if (input.mailboxId) {
    await prisma.mailboxEvent.create({
      data: {
        mailboxId: input.mailboxId,
        kind: "reply",
        contactId: input.contactId,
        toAddr: input.fromAddr,
        subject: input.subject ?? null,
        providerId: input.providerId ?? null,
      },
    });
  }
  return saved;
}

export function draftMailboxOutreach(input: {
  contactName: string;
  company?: string | null;
  title?: string | null;
  productContext?: string | null;
  opener?: string | null;
  senderName?: string | null;
}): ColdDraft {
  return draftColdOutreach(input);
}

export async function draftOutreachForUser(
  userId: string,
  input: {
    contactName: string;
    company?: string | null;
    title?: string | null;
    opener?: string | null;
    senderName?: string | null;
  },
): Promise<ColdDraft> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { productContext: true } });
  return draftColdOutreach({ ...input, productContext: user?.productContext });
}

function warmupTargetsOf(box: { warmupTargets: unknown; email: string }): string[] {
  if (Array.isArray(box.warmupTargets)) {
    return box.warmupTargets.filter((v): v is string => typeof v === "string" && v.includes("@"));
  }
  const sink = process.env.WARMUP_SINK_EMAIL?.trim();
  return sink ? [sink] : [];
}

export async function runWarmupTick(now = new Date()): Promise<{ warmed: number; promoted: number; sent: number }> {
  const boxes = await prisma.mailbox.findMany({
    where: { status: "warming" },
  });
  let warmed = 0;
  let promoted = 0;
  let sent = 0;

  for (const box of boxes) {
    if (!box.warmupStartedAt) continue;
    const day = warmupDayFromStart(box.warmupStartedAt, now);
    const limit = dailySendLimitForWarmupDay(day);
    const nextStatus = shouldPromoteToReady(box.status, day) ? "ready" : box.status;

    await prisma.mailbox.update({
      where: { id: box.id },
      data: {
        warmupDay: day,
        dailySendLimit: nextStatus === "ready" ? 40 : limit,
        status: nextStatus,
      },
    });
    warmed += 1;
    if (nextStatus === "ready") {
      promoted += 1;
      await prisma.mailboxEvent.create({
        data: { mailboxId: box.id, kind: "provision", meta: { via: "warmup_complete", day } },
      });
    }

    const remaining = remainingSendsToday({
      sentToday: box.sentToday,
      sentTodayOn: box.sentTodayOn,
      dailySendLimit: limit,
      now,
    });
    const targets = warmupTargetsOf(box);
    if (!box.smtpCiphertext || targets.length === 0 || remaining <= 0) {
      await prisma.mailboxEvent.create({
        data: { mailboxId: box.id, kind: "clock", meta: { day, remaining, delivered: false } },
      });
      continue;
    }

    const toSend = Math.min(remaining, 3, targets.length);
    for (let i = 0; i < toSend; i++) {
      const to = targets[i % targets.length]!;
      try {
        const result = await sendViaSmtpCiphertext(box.smtpCiphertext, {
          from: box.email,
          fromName: box.displayName,
          to,
          subject: "Re: catching up",
          text: "Just keeping this thread warm. No action needed.",
        });
        await consumeSendSlot({ ...box, dailySendLimit: limit, sentToday: box.sentToday + i, sentTodayOn: i === 0 ? box.sentTodayOn : now }, now);
        await prisma.mailboxEvent.create({
          data: {
            mailboxId: box.id,
            kind: "warmup",
            toAddr: to,
            subject: "Re: catching up",
            providerId: result.providerId ?? null,
          },
        });
        sent += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : "warmup send failed";
        await prisma.mailbox.update({ where: { id: box.id }, data: { lastError: message.slice(0, 500) } });
        break;
      }
    }
  }

  return { warmed, promoted, sent };
}

export async function listMailboxEvents(userId: string, mailboxId: string, limit = 40) {
  await assertMailboxOwned(userId, mailboxId);
  return prisma.mailboxEvent.findMany({
    where: { mailboxId },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });
}
