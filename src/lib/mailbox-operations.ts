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
  DEFAULT_HOURLY_SEND_LIMIT,
  followUpSubject,
  inferWarmupProfile,
  mailboxIsSendReady,
  maxColdSendsForDay,
  nextHourBoundary,
  remainingColdToday,
  remainingHourly,
  remainingWarmupToday,
  sameUtcDay,
  shouldPromoteToReady,
  warmupSendsForDay,
  WARMUP_SENDS_PER_TICK,
  warmupDayFromStart,
  WARMUP_READY_DAY,
} from "@/lib/mailbox-warmup";
import { STEADY_STATE_COLD_BYOK, STEADY_STATE_COLD_NEW_DOMAIN } from "@/lib/mailbox-warmup-limits";
import { clampFanoutLimit, decodeIdCursor, pageFromIds, type IdPage } from "@/lib/mailbox-page";
import {
  computeHealthScore,
  pauseReasonLabel,
  shouldAutoPause,
  type DnsFlags,
} from "@/lib/mailbox-health";
import { dnsHardStopEnabled, inspectDomainDns } from "@/lib/mailbox-dns";
import { openUserSecret, sealSecret } from "@/lib/mailbox-crypto";
import { draftColdOutreach, outreachLooksHealthy, type ColdDraft } from "@/lib/mailbox-draft";
import {
  checkDomainAvailability,
  godaddyConfigured,
  isPlausibleDomain,
  suggestDomains,
} from "@/lib/godaddy";
import { fetchInboxOrder, placeInboxOrder } from "@/lib/premium-inboxes";
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
  remainingWarmupToday: number;
  remainingHourly: number;
  healthScore: number;
  pausedReason: string | null;
  pausedReasonLabel: string | null;
  consecutiveFailures: number;
  lastInboundAt: Date | null;
  inboundStatus: "receiving" | "none";
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
    warmupSentToday?: number;
    warmupSentTodayOn?: Date | null;
    hourlySent?: number;
    hourlySentOn?: Date | null;
    hourlySendLimit?: number;
    healthScore?: number;
    pausedReason?: string | null;
    consecutiveFailures?: number;
    lastInboundAt?: Date | null;
    warmupStartedAt: Date | null;
    smtpLast4: string | null;
    lastError: string | null;
    createdAt: Date;
    domain?: { name: string } | null;
  },
  now = new Date(),
): PublicMailbox {
  const warmupSentToday = row.warmupSentToday ?? 0;
  const warmupSentTodayOn = row.warmupSentTodayOn ?? null;
  const hourlySent = row.hourlySent ?? 0;
  const hourlySentOn = row.hourlySentOn ?? null;
  const hourlySendLimit = row.hourlySendLimit ?? DEFAULT_HOURLY_SEND_LIMIT;
  const profile = inferWarmupProfile(row);
  const day = row.warmupStartedAt ? warmupDayFromStart(row.warmupStartedAt, now) : row.warmupDay;
  const warmupCap = warmupSendsForDay(day, profile);
  const coldCap = maxColdSendsForDay(day, profile);
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
    remainingToday: remainingColdToday({
      sentToday: row.sentToday,
      sentTodayOn: row.sentTodayOn,
      warmupSentToday,
      warmupSentTodayOn,
      dailySendLimit: dailySendLimitForWarmupDay(day, profile),
      coldCap,
      status: row.status,
      now,
    }),
    remainingWarmupToday: remainingWarmupToday({
      warmupSentToday,
      warmupSentTodayOn,
      dailySendLimit: warmupCap,
      now,
    }),
    remainingHourly: remainingHourly({ hourlySent, hourlySentOn, hourlySendLimit, now }),
    healthScore: row.healthScore ?? 100,
    pausedReason: row.pausedReason ?? null,
    pausedReasonLabel: pauseReasonLabel(row.pausedReason),
    consecutiveFailures: row.consecutiveFailures ?? 0,
    lastInboundAt: row.lastInboundAt ?? null,
    inboundStatus: row.lastInboundAt ? "receiving" : "none",
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
    imap?: { host: string; port?: number; secure?: boolean; username?: string; password?: string };
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
  const imapCiphertext = input.imap?.host
    ? sealSecret(
        JSON.stringify({
          host: input.imap.host,
          port: input.imap.port ?? 993,
          secure: input.imap.secure !== false,
          username: input.imap.username ?? input.smtp.username,
          password: input.imap.password ?? input.smtp.password,
        }),
      )
    : null;
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
        warmupDay: warming ? 1 : 21,
        dailySendLimit: warming ? dailySendLimitForWarmupDay(1) : STEADY_STATE_COLD_BYOK,
        smtpCiphertext: ciphertext,
        smtpLast4: smtpLast4(input.smtp.username),
        imapHost: input.imap?.host ?? null,
        imapPort: input.imap?.port ?? null,
        imapSecure: input.imap?.secure ?? true,
        imapCiphertext,
        nextEligibleAt: now,
      },
      include: { domain: { select: { name: true } } },
    });
    await prisma.mailboxEvent.create({
      data: { mailboxId: row.id, kind: "provision", meta: { via: "smtp", alreadyWarm: Boolean(input.alreadyWarm) } },
    });
    if (warming) {
      const { enqueueMailboxJobSafe } = await import("@/lib/mailbox-jobs");
      await enqueueMailboxJobSafe({ type: "warmup-one", mailboxId: row.id });
    }
    return toPublic(row, now);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2002") throw new OpError("That mailbox is already connected.", 409);
    throw e;
  }
}

const WARM_READY = WARMUP_READY_DAY;

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
    const { enqueueMailboxJobSafe } = await import("@/lib/mailbox-jobs");
    await enqueueMailboxJobSafe({ type: "fulfill-one", mailboxId: row.id });
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

export async function pauseMailbox(userId: string, mailboxId: string, reason = "operator") {
  const box = await assertMailboxOwned(userId, mailboxId);
  if (box.status === "paused") return toPublic(box);
  const updated = await prisma.mailbox.update({
    where: { id: mailboxId },
    data: { status: "paused", pausedReason: reason },
    include: { domain: { select: { name: true } } },
  });
  await prisma.mailboxEvent.create({
    data: { mailboxId, kind: "pause", meta: { reason } },
  });
  return toPublic(updated);
}

export async function resumeMailbox(userId: string, mailboxId: string) {
  const box = await assertMailboxOwned(userId, mailboxId);
  if (box.status !== "paused") throw new OpError("Only a paused mailbox can be resumed.", 400);
  const next = box.warmupDay >= WARM_READY || box.smtpCiphertext ? (box.warmupDay >= WARM_READY ? "ready" : "warming") : "requested";
  const updated = await prisma.mailbox.update({
    where: { id: mailboxId },
    data: { status: next, pausedReason: null, lastError: null },
    include: { domain: { select: { name: true } } },
  });
  await prisma.mailboxEvent.create({ data: { mailboxId, kind: "resume", meta: { status: next } } });
  return toPublic(updated);
}

export async function markMailboxReady(userId: string, mailboxId: string) {
  const box = await assertMailboxOwned(userId, mailboxId);
  const updated = await prisma.mailbox.update({
    where: { id: box.id },
    data: { status: "ready", dailySendLimit: STEADY_STATE_COLD_BYOK, lastError: null, warmupStartedAt: box.warmupStartedAt },
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

type SlotBox = {
  id: string;
  status: string;
  warmupDay?: number;
  warmupStartedAt?: Date | null;
  sentToday: number;
  sentTodayOn: Date | null;
  warmupSentToday?: number;
  warmupSentTodayOn?: Date | null;
  hourlySent?: number;
  hourlySentOn?: Date | null;
  hourlySendLimit?: number;
  dailySendLimit: number;
};

async function consumeSendSlot(box: SlotBox, now: Date, kind: "cold" | "warmup") {
  const hourlyLeft = remainingHourly({
    hourlySent: box.hourlySent ?? 0,
    hourlySentOn: box.hourlySentOn ?? null,
    hourlySendLimit: box.hourlySendLimit ?? DEFAULT_HOURLY_SEND_LIMIT,
    now,
  });
  if (hourlyLeft <= 0) {
    throw new OpError("Hourly send cap reached. Wait for the next hour.", 429);
  }
  if (kind === "warmup") {
    const remaining = remainingWarmupToday({
      warmupSentToday: box.warmupSentToday ?? 0,
      warmupSentTodayOn: box.warmupSentTodayOn ?? null,
      dailySendLimit: warmupSendsForDay(box.warmupDay || 1, inferWarmupProfile(box)),
      now,
    });
    if (remaining <= 0) {
      throw new OpError(`Warmup day cap reached (${box.dailySendLimit}).`, 429);
    }
  } else {
    const remaining = remainingColdToday({
      sentToday: box.sentToday,
      sentTodayOn: box.sentTodayOn,
      warmupSentToday: box.warmupSentToday ?? 0,
      warmupSentTodayOn: box.warmupSentTodayOn ?? null,
      dailySendLimit: box.dailySendLimit,
      coldCap: maxColdSendsForDay(box.warmupDay || 1, inferWarmupProfile(box)),
      status: box.status,
      now,
    });
    if (remaining <= 0) {
      throw new OpError(
        `Daily send cap reached (${box.dailySendLimit}). Try again tomorrow or wait for warmup to raise the cap.`,
        429,
      );
    }
  }
  const hourReset = !sameUtcHour(box.hourlySentOn ?? null, now);
  const dayReset = kind === "warmup" ? !sameUtcDay(box.warmupSentTodayOn ?? null, now) : !sameUtcDay(box.sentTodayOn, now);
  await prisma.mailbox.update({
    where: { id: box.id },
    data: {
      hourlySent: hourReset ? 1 : { increment: 1 },
      hourlySentOn: now,
      nextEligibleAt: nextHourBoundary(now),
      ...(kind === "warmup"
        ? {
            warmupSentToday: dayReset ? 1 : { increment: 1 },
            warmupSentTodayOn: now,
            lastWarmupAt: now,
          }
        : {
            sentToday: dayReset ? 1 : { increment: 1 },
            sentTodayOn: now,
          }),
    },
  });
}

function sameUtcHour(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  return a.toISOString().slice(0, 13) === b.toISOString().slice(0, 13);
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
    const key = openUserSecret(user?.agentMailApiKey);
    if (!key) throw new OpError("Connect an AgentMail key in Settings to send from this mailbox.", 409);
    const inboxId = box.providerInboxId ?? box.email;
    return sendViaAgentMail(key, inboxId, payload);
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
  if (contact.doNotContact) {
    throw new OpError(
      `Contact is on the do-not-contact list${contact.doNotContactReason ? ` (${contact.doNotContactReason})` : ""}.`,
      409,
    );
  }
  const to = contact.email?.trim();
  if (!to) throw new OpError("This contact has no email. Enrich them first.", 400);

  const requestedSubject = input.subject.trim();
  const body = input.body.trim();
  if (!requestedSubject || !body) throw new OpError("subject and body are required.", 400);
  if (requestedSubject.length > 200) throw new OpError("subject is too long.", 400);
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

  const prior = await prisma.contactEmail.findFirst({
    where: { contactId: contact.id, mailboxId: box.id, direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    select: { subject: true, messageId: true },
  });
  const subject = prior?.subject ? followUpSubject(prior.subject, requestedSubject) : requestedSubject;
  const messageId = `<${box.id}.${now.getTime()}@scalar>`;
  const inReplyTo = prior?.messageId ?? null;
  const references = [prior?.messageId, messageId].filter(Boolean).join(" ") || null;

  await ensureCredits(userId, "send_email");
  await consumeSendSlot(box, now, "cold");
  let delivered;
  try {
    delivered = await deliver(box, { to, subject, text: body });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed.";
    await recordMailboxFailure(box.id, message);
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
    messageId,
    inReplyTo,
    references,
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
      messageId,
      inReplyTo,
      references,
    },
  });
  await recordMailboxSuccess(box.id);
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
    messageId?: string | null;
    inReplyTo?: string | null;
    references?: string | null;
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
    messageId: input.messageId ?? null,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? null,
    savedAsContext: true,
    sentAt: new Date(),
  });
  if (input.mailboxId) {
    await prisma.mailbox.update({
      where: { id: input.mailboxId },
      data: { lastInboundAt: new Date() },
    });
    await prisma.mailboxEvent.create({
      data: {
        mailboxId: input.mailboxId,
        kind: "reply",
        contactId: input.contactId,
        toAddr: input.fromAddr,
        subject: input.subject ?? null,
        providerId: input.providerId ?? null,
        messageId: input.messageId ?? null,
        inReplyTo: input.inReplyTo ?? null,
        references: input.references ?? null,
        classification: "REPLY",
      },
    });
  }
  return saved;
}

export async function setDoNotContact(
  userId: string,
  contactId: string,
  reason: string,
  at = new Date(),
) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  return prisma.contact.update({
    where: { id: contactId },
    data: { doNotContact: true, doNotContactReason: reason.slice(0, 120), doNotContactAt: at },
  });
}

export async function recordMailboxFailure(mailboxId: string, message: string) {
  const box = await prisma.mailbox.findUnique({
    where: { id: mailboxId },
    include: { domain: true },
  });
  if (!box) return;
  const consecutiveFailures = (box.consecutiveFailures ?? 0) + 1;
  const dns: DnsFlags | null = box.domain
    ? {
        spfOk: box.domain.spfOk,
        dkimOk: box.domain.dkimOk,
        dmarcOk: box.domain.dmarcOk,
        mxOk: box.domain.mxOk,
        spfPlusAll: box.domain.spfOk === false && /plus_all|\+all/i.test(box.domain.lastError ?? ""),
      }
    : null;
  const healthScore = computeHealthScore({ consecutiveFailures, dns });
  const pause = shouldAutoPause({ consecutiveFailures, healthScore, dns });
  await prisma.mailbox.update({
    where: { id: mailboxId },
    data: {
      lastError: message.slice(0, 500),
      consecutiveFailures,
      healthScore,
      ...(pause ? { status: "paused", pausedReason: pause } : {}),
    },
  });
  if (pause) {
    await prisma.mailboxEvent.create({
      data: { mailboxId, kind: "health", meta: { pause, consecutiveFailures, healthScore } },
    });
  }
}

export async function recordMailboxSuccess(mailboxId: string) {
  const box = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!box) return;
  const healthScore = computeHealthScore({
    consecutiveFailures: 0,
    dns: null,
  });
  await prisma.mailbox.update({
    where: { id: mailboxId },
    data: { lastError: null, consecutiveFailures: 0, healthScore: Math.max(box.healthScore ?? 100, healthScore) },
  });
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

async function alreadyTickedThisHour(mailboxId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 50 * 60 * 1000);
  const recent = await prisma.mailboxEvent.findFirst({
    where: { mailboxId, kind: { in: ["clock", "warmup"] }, createdAt: { gte: since } },
    select: { id: true },
  });
  return Boolean(recent);
}

export async function runWarmupForMailbox(
  mailboxId: string,
  now = new Date(),
): Promise<{ warmed: number; promoted: number; sent: number; skipped?: boolean }> {
  const box = await prisma.mailbox.findUnique({
    where: { id: mailboxId },
    include: { domain: true },
  });
  if (!box || box.status !== "warming" || !box.warmupStartedAt) {
    return { warmed: 0, promoted: 0, sent: 0, skipped: true };
  }
  if (box.nextEligibleAt && box.nextEligibleAt.getTime() > now.getTime()) {
    return { warmed: 0, promoted: 0, sent: 0, skipped: true };
  }
  if (await alreadyTickedThisHour(box.id, now)) {
    return { warmed: 0, promoted: 0, sent: 0, skipped: true };
  }

  const dns: DnsFlags | null = box.domain
    ? {
        spfOk: box.domain.spfOk,
        dkimOk: box.domain.dkimOk,
        dmarcOk: box.domain.dmarcOk,
        mxOk: box.domain.mxOk,
        spfPlusAll: box.domain.spfOk === false && /plus_all|\+all/i.test(JSON.stringify(box.domain.dnsRecords ?? "")),
      }
    : null;
  const hard = dns ? shouldAutoPause({ consecutiveFailures: 0, healthScore: 100, dns }) : null;
  if (hard && dnsHardStopEnabled() && (hard === "spf_plus_all" || hard === "mx_missing")) {
    await prisma.mailbox.update({
      where: { id: box.id },
      data: { status: "paused", pausedReason: hard, healthScore: computeHealthScore({ consecutiveFailures: 0, dns }) },
    });
    await prisma.mailboxEvent.create({
      data: { mailboxId: box.id, kind: "health", meta: { pause: hard, via: "warmup_dns" } },
    });
    return { warmed: 0, promoted: 0, sent: 0, skipped: true };
  }

  const day = warmupDayFromStart(box.warmupStartedAt, now);
  const limit = dailySendLimitForWarmupDay(day);
  const nextStatus = shouldPromoteToReady(box.status, day) ? "ready" : box.status;

  await prisma.mailbox.update({
    where: { id: box.id },
    data: {
      warmupDay: day,
      dailySendLimit: nextStatus === "ready" ? STEADY_STATE_COLD_NEW_DOMAIN : limit,
      status: nextStatus,
      healthScore: computeHealthScore({
        consecutiveFailures: box.consecutiveFailures ?? 0,
        dns,
      }),
    },
  });
  let promoted = 0;
  if (nextStatus === "ready") {
    promoted = 1;
    await prisma.mailboxEvent.create({
      data: { mailboxId: box.id, kind: "provision", meta: { via: "warmup_complete", day } },
    });
  }

  const remaining = remainingWarmupToday({
    warmupSentToday: box.warmupSentToday ?? 0,
    warmupSentTodayOn: box.warmupSentTodayOn ?? null,
    dailySendLimit: limit,
    now,
  });
  const targets = warmupTargetsOf(box);
  if (!box.smtpCiphertext || targets.length === 0 || remaining <= 0) {
    await prisma.mailboxEvent.create({
      data: { mailboxId: box.id, kind: "clock", meta: { day, remaining, delivered: false } },
    });
    await prisma.mailbox.update({
      where: { id: box.id },
      data: { lastWarmupAt: now, nextEligibleAt: nextHourBoundary(now) },
    });
    return { warmed: 1, promoted, sent: 0 };
  }

  let sent = 0;
  const toSend = Math.min(remaining, WARMUP_SENDS_PER_TICK, targets.length);
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
      await consumeSendSlot(
        {
          ...box,
          dailySendLimit: limit,
          warmupSentToday: (box.warmupSentToday ?? 0) + i,
          warmupSentTodayOn: i === 0 ? box.warmupSentTodayOn ?? null : now,
        },
        now,
        "warmup",
      );
      await prisma.mailboxEvent.create({
        data: {
          mailboxId: box.id,
          kind: "warmup",
          toAddr: to,
          subject: "Re: catching up",
          providerId: result.providerId ?? null,
          classification: "WARMUP",
        },
      });
      sent += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "warmup send failed";
      await recordMailboxFailure(box.id, message);
      break;
    }
  }
  return { warmed: 1, promoted, sent };
}

export async function runWarmupTick(now = new Date()): Promise<{ warmed: number; promoted: number; sent: number }> {
  const page = await listWarmingMailboxPage(undefined, 200, now);
  let warmed = 0;
  let promoted = 0;
  let sent = 0;
  for (const id of page.ids) {
    const result = await runWarmupForMailbox(id, now);
    warmed += result.warmed;
    promoted += result.promoted;
    sent += result.sent;
  }
  return { warmed, promoted, sent };
}

export async function listWarmingMailboxPage(
  cursor?: string | null,
  limit?: number,
  now = new Date(),
): Promise<IdPage> {
  const take = clampFanoutLimit(limit);
  const after = decodeIdCursor(cursor);
  const rows = await prisma.mailbox.findMany({
    where: {
      status: "warming",
      AND: [
        { OR: [{ nextEligibleAt: null }, { nextEligibleAt: { lte: now } }] },
        ...(after ? [{ id: { gt: after } }] : []),
      ],
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  return pageFromIds(rows, take);
}

export async function listPendingMailboxPage(cursor?: string | null, limit?: number): Promise<IdPage> {
  const take = clampFanoutLimit(limit);
  const after = decodeIdCursor(cursor);
  const rows = await prisma.mailbox.findMany({
    where: {
      status: { in: ["requested", "provisioning"] },
      ...(after ? { id: { gt: after } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  return pageFromIds(rows, take);
}

export async function listImapMailboxPage(cursor?: string | null, limit?: number): Promise<IdPage> {
  const take = clampFanoutLimit(limit);
  const after = decodeIdCursor(cursor);
  const rows = await prisma.mailbox.findMany({
    where: {
      OR: [{ imapCiphertext: { not: null } }, { imapHost: { not: null } }],
      status: { in: ["warming", "ready", "paused"] },
      ...(after ? { id: { gt: after } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  return pageFromIds(rows, take);
}

export async function listDomainDnsPage(cursor?: string | null, limit?: number, now = new Date()): Promise<IdPage> {
  const take = clampFanoutLimit(limit);
  const after = decodeIdCursor(cursor);
  const stale = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await prisma.domain.findMany({
    where: {
      OR: [{ dnsCheckedAt: null }, { dnsCheckedAt: { lt: stale } }],
      ...(after ? { id: { gt: after } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  return pageFromIds(rows, take);
}

export async function checkDomainDnsById(domainId: string) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) return { skipped: true };
  const posture = await inspectDomainDns(domain.name);
  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      spfOk: posture.spfOk,
      dkimOk: posture.dkimOk,
      dmarcOk: posture.dmarcOk,
      mxOk: posture.mxOk,
      dnsCheckedAt: posture.checkedAt,
      dnsRecords: posture.records,
      lastError: posture.hardStopReason,
    },
  });
  if (posture.hardStop && dnsHardStopEnabled()) {
    const reason = posture.hardStopReason === "spf_plus_all" ? "spf_plus_all" : "mx_missing";
    const boxes = await prisma.mailbox.findMany({
      where: { domainId: domain.id, status: { in: ["warming", "ready"] } },
      select: { id: true },
    });
    for (const box of boxes) {
      await prisma.mailbox.update({
        where: { id: box.id },
        data: {
          status: "paused",
          pausedReason: reason,
          healthScore: computeHealthScore({
            consecutiveFailures: 0,
            dns: {
              spfOk: posture.spfOk,
              dkimOk: posture.dkimOk,
              dmarcOk: posture.dmarcOk,
              mxOk: posture.mxOk,
              spfPlusAll: posture.spfPlusAll,
            },
          }),
        },
      });
      await prisma.mailboxEvent.create({
        data: { mailboxId: box.id, kind: "health", meta: { pause: reason, via: "dns" } },
      });
    }
  }
  return { ...posture, skipped: false };
}

export async function checkDomainDnsForUser(userId: string, domainId: string) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain || domain.userId !== userId) throw new OpError("Domain not found", 404);
  return checkDomainDnsById(domainId);
}

export async function pollPendingMailboxOrders(filter?: {
  mailboxId?: string;
  orderId?: string;
}): Promise<{ checked: number; fulfilled: number }> {
  const boxes = filter?.mailboxId
    ? await prisma.mailbox.findMany({ where: { id: filter.mailboxId } })
    : filter?.orderId
      ? await prisma.mailbox.findMany({ where: { providerOrderId: filter.orderId } })
      : await prisma.mailbox.findMany({
          where: { status: { in: ["requested", "provisioning"] } },
          take: 50,
        });

  let fulfilled = 0;
  for (const box of boxes) {
    if (box.status !== "requested" && box.status !== "provisioning") continue;
    if (!box.providerOrderId) continue;
    try {
      const order = await fetchInboxOrder(box.providerOrderId);
      if (!order?.ready || !order.email) continue;
      await fulfillMailboxProvision({
        mailboxId: box.id,
        email: order.email,
        smtp: order.smtp,
        providerInboxId: order.providerInboxId,
      });
      fulfilled += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "fulfillment poll failed";
      await prisma.mailbox.update({
        where: { id: box.id },
        data: { lastError: message.slice(0, 500) },
      });
    }
  }
  return { checked: boxes.length, fulfilled };
}

export async function listMailboxEvents(userId: string, mailboxId: string, limit = 40) {
  await assertMailboxOwned(userId, mailboxId);
  return prisma.mailboxEvent.findMany({
    where: { mailboxId },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });
}
