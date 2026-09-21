// Agent mailboxes: the shared ops layer behind the REST routes, the MCP tools
// and the Inngest jobs. Everything an agent can do with email goes through
// here so the guards live in exactly one place:
//
//   - a contact marked doNotContact is never emailed (bounce / unsubscribe);
//   - a mailbox never exceeds its cold daily cap, which during warmup is far
//     below the operator-set ceiling (src/lib/mail/warmup.ts);
//   - a mailbox with a failing health score sends nothing;
//   - warmup traffic never touches the CRM (no ContactEmail, no activity, no
//     status change) and never counts toward the cold cap.
//
// Providers are dispatched on Mailbox.provider: AGENTMAIL (Scalar's platform
// key, src/lib/agentmail.ts) or SMTP (nodemailer + IMAP with a sealed app
// password, src/lib/mail/smtp.ts). Domains are bought through the configured
// registrar (src/lib/mail/registrar.ts) and paid through Stripe; where a vendor
// has no API (PremiumInboxes) the order stops at ACTION_REQUIRED and the
// operator imports the delivered credentials.

import { randomBytes } from "crypto";
import { Prisma, type Mailbox, type MailDomain, type MailMessage, type MailboxOrder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError, logOutreach, type ActivityActor } from "@/lib/crm-operations";
import { attributeReply } from "@/lib/variant-operations";
import { notifyTaskWebhook } from "@/lib/notify";
import { inngest } from "@/lib/inngest";
import { isSecretBoxConfigured, openSecret, sealSecret } from "@/lib/secret-box";
import * as agentmail from "@/lib/agentmail";
import { imapFetchNew, imapVerify, smtpSend, smtpVerify, guessHosts, type SmtpCredentials } from "@/lib/mail/smtp";
import { classifyInbound, extractAddress, WARMUP_HEADER, type InboundClassName } from "@/lib/mail/classify";
import { checkDomainDns, isValidDomain, normalizeDomain } from "@/lib/mail/dns";
import {
  configuredRegistrar,
  baselineDnsRecords,
  RegistrarError,
  type RegistrantContact,
  type DnsRecordInput,
} from "@/lib/mail/registrar";
import {
  coldRemainingToday,
  coldCapForState,
  computeHealthScore,
  statusForWarmupDay,
  warmupRemainingToday,
  warmupMessage,
  warmupReply,
  isWarmupToken,
  WARMUP_TOKEN_PREFIX,
  COLD_START_DAY,
  type WarmupState,
} from "@/lib/mail/warmup";
import { createOrderCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { ensureCredits, spendCredits } from "@/lib/credits";

export { OpError };

/* ------------------------------ Pricing ------------------------------ */

function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Markup over the registrar's first-year price, cents. */
export const DOMAIN_MARKUP_USD_CENTS = () => envInt("MAIL_DOMAIN_MARKUP_USD_CENTS", 800);
/** Used when the registrar cannot quote (gated availability endpoint). */
export const DOMAIN_FALLBACK_PRICE_USD_CENTS = () => envInt("MAIL_DOMAIN_FALLBACK_PRICE_USD_CENTS", 2499);
/** Per inbox, per month, cents. */
export const INBOX_PRICE_USD_CENTS = () => envInt("MAIL_INBOX_PRICE_USD_CENTS", 700);
/** Maximum inboxes per domain we will provision (reputation, not a limit). */
export const MAX_INBOXES_PER_DOMAIN = 3;
export const MAX_MAILBOXES_PER_USER = 50;

/* ------------------------------ Views ------------------------------ */

export interface MailboxView {
  id: string;
  address: string;
  displayName: string | null;
  provider: Mailbox["provider"];
  status: Mailbox["status"];
  domainId: string | null;
  dailyCap: number;
  coldCapToday: number;
  sentToday: number;
  coldRemainingToday: number;
  warmupEnabled: boolean;
  warmupDay: number;
  warmupSentToday: number;
  warmupSent: number;
  warmupReplies: number;
  warmupSpamSaved: number;
  daysUntilColdAllowed: number;
  healthScore: number;
  bounces: number;
  complaints: number;
  sentTotal: number;
  lastError: string | null;
  lastErrorAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

function warmupStateOf(m: Mailbox, today = utcMidnight()): WarmupState {
  const fresh = !m.sentDate || m.sentDate.getTime() !== today.getTime();
  return {
    status: m.status,
    warmupEnabled: m.warmupEnabled,
    warmupDay: m.warmupDay,
    dailyCap: m.dailyCap,
    healthScore: m.healthScore,
    sentToday: fresh ? 0 : m.sentToday,
    warmupSentToday: fresh ? 0 : m.warmupSentToday,
  };
}

export function toMailboxView(m: Mailbox): MailboxView {
  const s = warmupStateOf(m);
  return {
    id: m.id,
    address: m.address,
    displayName: m.displayName,
    provider: m.provider,
    status: m.status,
    domainId: m.domainId,
    dailyCap: m.dailyCap,
    coldCapToday: coldCapForState(s),
    sentToday: s.sentToday,
    coldRemainingToday: coldRemainingToday(s),
    warmupEnabled: m.warmupEnabled,
    warmupDay: m.warmupDay,
    warmupSentToday: s.warmupSentToday,
    warmupSent: m.warmupSent,
    warmupReplies: m.warmupReplies,
    warmupSpamSaved: m.warmupSpamSaved,
    daysUntilColdAllowed: m.warmupEnabled ? Math.max(0, COLD_START_DAY - m.warmupDay) : 0,
    healthScore: m.healthScore,
    bounces: m.bounces,
    complaints: m.complaints,
    sentTotal: m.sentTotal,
    lastError: m.lastError,
    lastErrorAt: m.lastErrorAt,
    lastSyncedAt: m.lastSyncedAt,
    createdAt: m.createdAt,
  };
}

export interface MailMessageView {
  id: string;
  mailboxId: string;
  contactId: string | null;
  direction: MailMessage["direction"];
  status: MailMessage["status"];
  fromAddr: string;
  toAddr: string;
  subject: string | null;
  text: string | null;
  classification: MailMessage["classification"];
  classifierNote: string | null;
  threadKey: string | null;
  inReplyTo: string | null;
  rfcMessageId: string | null;
  isWarmup: boolean;
  error: string | null;
  sentAt: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
}

export function toMessageView(m: MailMessage): MailMessageView {
  return {
    id: m.id,
    mailboxId: m.mailboxId,
    contactId: m.contactId,
    direction: m.direction,
    status: m.status,
    fromAddr: m.fromAddr,
    toAddr: m.toAddr,
    subject: m.subject,
    text: m.textBody,
    classification: m.classification,
    classifierNote: m.classifierNote,
    threadKey: m.threadKey,
    inReplyTo: m.inReplyTo,
    rfcMessageId: m.rfcMessageId,
    isWarmup: m.isWarmup,
    error: m.error,
    sentAt: m.sentAt,
    receivedAt: m.receivedAt,
    createdAt: m.createdAt,
  };
}

/* ------------------------------ Helpers ------------------------------ */

export function utcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim()) && s.length <= 254;
}

async function ownedMailbox(userId: string, id: string): Promise<Mailbox> {
  const m = await prisma.mailbox.findUnique({ where: { id } });
  if (!m || m.userId !== userId) throw new OpError("Mailbox not found", 404);
  return m;
}

async function ownedDomain(userId: string, id: string): Promise<MailDomain> {
  const d = await prisma.mailDomain.findUnique({ where: { id } });
  if (!d || d.userId !== userId) throw new OpError("Domain not found", 404);
  return d;
}

function smtpCredentials(m: Mailbox): SmtpCredentials {
  if (!m.secretCiphertext || !m.smtpHost || !m.smtpPort) throw new OpError("Mailbox has no SMTP credentials", 409);
  return {
    address: m.address,
    displayName: m.displayName,
    username: m.username ?? m.address,
    password: openSecret(m.secretCiphertext),
    smtpHost: m.smtpHost,
    smtpPort: m.smtpPort,
    imapHost: m.imapHost,
    imapPort: m.imapPort,
  };
}

function providerReady(m: Mailbox): string | null {
  if (m.provider === "AGENTMAIL") {
    if (!agentmail.isAgentMailPlatformConfigured()) return "AGENTMAIL_API_KEY is not configured on this deployment.";
    if (!m.providerInboxId) return "Mailbox has no provider inbox id.";
    return null;
  }
  if (!isSecretBoxConfigured()) return "MAILBOX_SECRET_KEY is not configured on this deployment.";
  if (!m.secretCiphertext) return "Mailbox has no stored credentials.";
  return null;
}

/** Reset the day counters when the UTC day rolled over. Idempotent. */
async function rolloverCounters(m: Mailbox, today = utcMidnight()): Promise<Mailbox> {
  if (m.sentDate && m.sentDate.getTime() === today.getTime()) return m;
  await prisma.mailbox.updateMany({
    where: { id: m.id, OR: [{ sentDate: null }, { sentDate: { not: today } }] },
    data: { sentDate: today, sentToday: 0, warmupSentToday: 0 },
  });
  return (await prisma.mailbox.findUnique({ where: { id: m.id } })) ?? m;
}

/** Atomically take one send slot (cold or warmup). False when the cap is hit. */
async function reserveSlot(m: Mailbox, kind: "cold" | "warmup"): Promise<boolean> {
  const today = utcMidnight();
  const fresh = await rolloverCounters(m, today);
  // Cold sends are capped here; warmup volume is paced by the engine
  // (warmupRemainingToday), so its slot only bumps the counters.
  const field = kind === "cold" ? "sentToday" : "warmupSentToday";
  const limit = kind === "cold" ? coldCapForState(warmupStateOf(fresh, today)) : Number.MAX_SAFE_INTEGER;
  const r = await prisma.mailbox.updateMany({
    where: { id: m.id, sentDate: today, [field]: { lt: limit } },
    data: { [field]: { increment: 1 }, sentTotal: { increment: 1 } },
  });
  return r.count === 1;
}

async function releaseSlot(mailboxId: string, kind: "cold" | "warmup"): Promise<void> {
  const field = kind === "cold" ? "sentToday" : "warmupSentToday";
  await prisma.mailbox
    .updateMany({ where: { id: mailboxId, [field]: { gt: 0 } }, data: { [field]: { decrement: 1 }, sentTotal: { decrement: 1 } } })
    .catch(() => {});
}

interface ProviderSendInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  /** Threading: the inbound MailMessage we're answering, if any. */
  replyTo?: { providerMessageId: string | null; rfcMessageId: string | null; threadKey: string | null } | null;
}

interface ProviderSendResult {
  providerMessageId: string;
  rfcMessageId: string | null;
  providerThreadId: string | null;
}

async function providerSend(m: Mailbox, input: ProviderSendInput): Promise<ProviderSendResult> {
  if (m.provider === "AGENTMAIL") {
    const key = agentmail.platformAgentMailKey();
    if (!key || !m.providerInboxId) throw new OpError("AgentMail is not configured for this mailbox", 501);
    const r =
      input.replyTo?.providerMessageId
        ? await agentmail.replyToMessage(key, m.providerInboxId, input.replyTo.providerMessageId, {
            text: input.text,
            html: input.html,
            headers: input.headers,
          })
        : await agentmail.sendMessage(key, m.providerInboxId, {
            to: [input.to],
            subject: input.subject,
            text: input.text,
            html: input.html,
            headers: input.headers,
          });
    return { providerMessageId: r.messageId, rfcMessageId: null, providerThreadId: r.threadId ?? null };
  }
  const creds = smtpCredentials(m);
  const refs = input.replyTo
    ? [input.replyTo.threadKey, input.replyTo.rfcMessageId].filter((x): x is string => Boolean(x))
    : [];
  const r = await smtpSend(creds, {
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    inReplyTo: input.replyTo?.rfcMessageId ?? null,
    references: refs.length ? Array.from(new Set(refs)) : null,
    headers: input.headers,
  });
  if (r.rejected.length && !r.accepted.length) throw new OpError(`SMTP rejected recipient ${r.rejected.join(", ")}`, 502);
  return { providerMessageId: r.rfcMessageId, rfcMessageId: r.rfcMessageId, providerThreadId: null };
}

/* ------------------------------ Mailboxes ------------------------------ */

export async function listMailboxes(userId: string): Promise<MailboxView[]> {
  const rows = await prisma.mailbox.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return rows.map(toMailboxView);
}

export async function getMailbox(userId: string, id: string): Promise<MailboxView> {
  return toMailboxView(await ownedMailbox(userId, id));
}

async function assertMailboxBudget(userId: string, adding = 1): Promise<void> {
  const n = await prisma.mailbox.count({ where: { userId } });
  if (n + adding > MAX_MAILBOXES_PER_USER) throw new OpError(`Mailbox limit reached (${MAX_MAILBOXES_PER_USER}).`, 409);
}

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

/** Create an inbox on AgentMail under one of the account's verified domains
 *  (or AgentMail's default domain when none is given; fine for replies and
 *  testing, poor for cold volume). */
export async function createAgentMailMailbox(
  userId: string,
  input: { username: string; domainId?: string | null; displayName?: string | null; dailyCap?: number },
): Promise<MailboxView> {
  const key = agentmail.platformAgentMailKey();
  if (!key) throw new OpError("AgentMail is not configured on this deployment (AGENTMAIL_API_KEY).", 501);
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new OpError("Username may contain letters, digits, dots, dashes and underscores.", 400);
  await assertMailboxBudget(userId);

  let domain: MailDomain | null = null;
  if (input.domainId) {
    domain = await ownedDomain(userId, input.domainId);
    if (!domain.providerDomainId) throw new OpError("Connect this domain to AgentMail first (POST /api/mail/domains/:id/connect).", 409);
    if (domain.status !== "VERIFIED") throw new OpError("Domain DNS is not verified yet; inboxes on it would not deliver.", 409);
    const onDomain = await prisma.mailbox.count({ where: { domainId: domain.id } });
    if (onDomain >= MAX_INBOXES_PER_DOMAIN) throw new OpError(`Keep it to ${MAX_INBOXES_PER_DOMAIN} inboxes per domain; add another domain instead.`, 409);
  }
  const address = `${username}@${domain ? domain.domain : "agentmail.to"}`;
  const dup = await prisma.mailbox.findUnique({ where: { userId_address: { userId, address } } });
  if (dup) throw new OpError("You already have a mailbox at that address.", 409);

  const inbox = await agentmail.createInbox(key, {
    username,
    domain: domain?.domain,
    displayName: input.displayName ?? undefined,
    clientId: `scalar-${userId}-${address}`,
  });
  const row = await prisma.mailbox.create({
    data: {
      userId,
      domainId: domain?.id ?? null,
      address: inbox.email.toLowerCase(),
      displayName: input.displayName ?? null,
      provider: "AGENTMAIL",
      status: "WARMING",
      providerInboxId: inbox.inboxId,
      dailyCap: clampCap(input.dailyCap),
      warmupStartedAt: new Date(),
    },
  });
  return toMailboxView(row);
}

function clampCap(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 30;
  return Math.max(1, Math.min(200, Math.round(v)));
}

export interface SmtpMailboxInput {
  address: string;
  password: string;
  displayName?: string | null;
  username?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  imapHost?: string | null;
  imapPort?: number | null;
  providerHint?: "google" | "microsoft" | null;
  dailyCap?: number;
  orderId?: string | null;
  /** Skip the live SMTP/IMAP check (tests only). */
  skipVerify?: boolean;
}

/** Bring a Google Workspace / Microsoft 365 / any-IMAP mailbox under Scalar's
 *  control. Credentials are checked live, then sealed; the plaintext never
 *  lands in the database or in any response. */
export async function importSmtpMailbox(userId: string, input: SmtpMailboxInput): Promise<MailboxView> {
  if (!isSecretBoxConfigured()) throw new OpError("MAILBOX_SECRET_KEY is not configured on this deployment; SMTP mailboxes cannot be stored.", 501);
  const address = input.address.trim().toLowerCase();
  if (!isValidEmail(address)) throw new OpError("Invalid email address", 400);
  if (!input.password || input.password.length < 4) throw new OpError("Password / app password is required", 400);
  await assertMailboxBudget(userId);

  const guess = guessHosts(address, input.providerHint ?? null);
  const smtpHost = input.smtpHost?.trim() || guess?.smtpHost;
  const smtpPort = input.smtpPort ?? guess?.smtpPort ?? 587;
  const imapHost = input.imapHost?.trim() || guess?.imapHost || null;
  const imapPort = input.imapPort ?? guess?.imapPort ?? 993;
  if (!smtpHost) throw new OpError("smtpHost is required for this address (could not infer the provider).", 400);

  const dup = await prisma.mailbox.findUnique({ where: { userId_address: { userId, address } } });
  if (dup) throw new OpError("You already have a mailbox at that address.", 409);

  const creds: SmtpCredentials = {
    address,
    displayName: input.displayName,
    username: input.username?.trim() || address,
    password: input.password,
    smtpHost,
    smtpPort,
    imapHost,
    imapPort,
  };
  if (!input.skipVerify) {
    const s = await smtpVerify(creds);
    if (!s.ok) throw new OpError(`SMTP login failed: ${s.error ?? "unknown error"}`, 400);
    if (imapHost) {
      const i = await imapVerify(creds);
      if (!i.ok) throw new OpError(`IMAP login failed: ${i.error ?? "unknown error"}`, 400);
    }
  }

  const domainName = address.split("@")[1];
  const domain = await prisma.mailDomain.findUnique({ where: { userId_domain: { userId, domain: domainName } } });

  const row = await prisma.mailbox.create({
    data: {
      userId,
      domainId: domain?.id ?? null,
      address,
      displayName: input.displayName ?? null,
      provider: "SMTP",
      status: "WARMING",
      smtpHost,
      smtpPort,
      imapHost,
      imapPort: imapHost ? imapPort : null,
      username: creds.username,
      secretCiphertext: sealSecret(input.password),
      dailyCap: clampCap(input.dailyCap),
      warmupStartedAt: new Date(),
      orderId: input.orderId ?? null,
    },
  });
  return toMailboxView(row);
}

export async function updateMailbox(
  userId: string,
  id: string,
  patch: { displayName?: string | null; dailyCap?: number; warmupEnabled?: boolean; paused?: boolean },
): Promise<MailboxView> {
  const m = await ownedMailbox(userId, id);
  const data: Prisma.MailboxUncheckedUpdateInput = {};
  if (patch.displayName !== undefined) data.displayName = patch.displayName;
  if (patch.dailyCap !== undefined) data.dailyCap = clampCap(patch.dailyCap);
  if (patch.warmupEnabled !== undefined) data.warmupEnabled = patch.warmupEnabled;
  if (patch.paused === true && m.status !== "DISABLED") data.status = "PAUSED";
  if (patch.paused === false && m.status === "PAUSED") {
    data.status = statusForWarmupDay("WARMING", m.warmupDay, patch.warmupEnabled ?? m.warmupEnabled);
  }
  const row = await prisma.mailbox.update({ where: { id }, data });
  return toMailboxView(row);
}

export async function deleteMailbox(userId: string, id: string): Promise<{ ok: true }> {
  const m = await ownedMailbox(userId, id);
  if (m.provider === "AGENTMAIL" && m.providerInboxId) {
    const key = agentmail.platformAgentMailKey();
    if (key) await agentmail.deleteInbox(key, m.providerInboxId).catch(() => {});
  }
  await prisma.mailbox.delete({ where: { id } });
  return { ok: true };
}

/* ------------------------------ Sending ------------------------------ */

export interface SendMailInput {
  mailboxId?: string | null;
  contactId?: string | null;
  to?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  variantId?: string | null;
  /** Reply in-thread to an inbound MailMessage (id). */
  replyToMessageId?: string | null;
  /** Who did it (API key / member), for the activity feed. */
  actor?: ActivityActor | null;
}

export interface SendMailResult {
  message: MailMessageView;
  mailbox: { id: string; address: string; coldRemainingToday: number };
  contactId: string | null;
}

/** Pick the mailbox with the most cold headroom that is healthy enough to send. */
export async function chooseSendingMailbox(userId: string, preferDomainId?: string | null): Promise<Mailbox | null> {
  const rows = await prisma.mailbox.findMany({
    where: { userId, status: { in: ["ACTIVE", "WARMING"] } },
  });
  const today = utcMidnight();
  const ready = rows
    .filter((m) => providerReady(m) === null)
    .map((m) => ({ m, remaining: coldRemainingToday(warmupStateOf(m, today)) }))
    .filter((x) => x.remaining > 0)
    .sort((a, b) => {
      if (preferDomainId && (a.m.domainId === preferDomainId) !== (b.m.domainId === preferDomainId)) {
        return a.m.domainId === preferDomainId ? -1 : 1;
      }
      if (a.m.status !== b.m.status) return a.m.status === "ACTIVE" ? -1 : 1;
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return b.m.healthScore - a.m.healthScore;
    });
  return ready[0]?.m ?? null;
}

/**
 * Send one email from an agent mailbox. Cold sends (no replyToMessageId) are
 * capped per mailbox per day; replies in-thread are not capped (answering a
 * human is never the thing that burns a domain) but still respect
 * doNotContact and mailbox health.
 */
export async function sendMail(userId: string, input: SendMailInput): Promise<SendMailResult> {
  let subject = input.subject.trim();
  const text = input.text.trim();
  if (!text) throw new OpError("text is required", 400);
  if (subject.length > 300) throw new OpError("subject is too long", 400);
  if (text.length > 50_000) throw new OpError("text is too long", 400);

  // Resolve the counterparty.
  let contactId: string | null = null;
  let to = input.to?.trim().toLowerCase() ?? "";
  let replyTo: MailMessage | null = null;

  if (input.replyToMessageId) {
    replyTo = await prisma.mailMessage.findUnique({ where: { id: input.replyToMessageId } });
    if (!replyTo || replyTo.userId !== userId) throw new OpError("Message to reply to not found", 404);
    if (replyTo.direction !== "INBOUND") throw new OpError("Can only reply to an inbound message", 400);
    if (replyTo.isWarmup) throw new OpError("That is warmup traffic, not a conversation", 400);
    to = replyTo.fromAddr.toLowerCase();
    contactId = replyTo.contactId;
    // Keep the thread's subject unless the caller wrote a real one.
    if (!subject || /^re:?$/i.test(subject)) {
      const base = (replyTo.subject ?? "").replace(/^\s*(re|fwd?):\s*/i, "").trim();
      subject = base ? `Re: ${base}` : "Re:";
    }
  }
  if (!subject) throw new OpError("subject is required", 400);
  if (input.contactId) {
    const c = await prisma.contact.findUnique({ where: { id: input.contactId } });
    if (!c || c.userId !== userId) throw new OpError("Contact not found", 404);
    if (!c.email && !to) throw new OpError("Contact has no email address", 400);
    contactId = c.id;
    if (!to) to = c.email!.trim().toLowerCase();
  }
  if (!to) throw new OpError("Provide contactId, to, or replyToMessageId", 400);
  if (!isValidEmail(to)) throw new OpError("Invalid recipient address", 400);

  // Never email someone who bounced or opted out, whichever way we got here.
  const dnc = contactId
    ? await prisma.contact.findUnique({ where: { id: contactId }, select: { doNotContact: true, doNotContactReason: true } })
    : await prisma.contact.findFirst({
        where: { userId, email: { equals: to, mode: "insensitive" }, doNotContact: true },
        select: { doNotContact: true, doNotContactReason: true },
      });
  if (dnc?.doNotContact) {
    throw new OpError(`Refusing to email ${to}: marked do-not-contact (${dnc.doNotContactReason ?? "opted out"}).`, 409);
  }
  if (!contactId) {
    const match = await prisma.contact.findFirst({ where: { userId, email: { equals: to, mode: "insensitive" } }, select: { id: true } });
    if (match) contactId = match.id;
  }

  // Pick the mailbox.
  const isReply = Boolean(replyTo);
  let mailbox: Mailbox | null;
  if (input.mailboxId) mailbox = await ownedMailbox(userId, input.mailboxId);
  else if (replyTo) mailbox = await prisma.mailbox.findUnique({ where: { id: replyTo.mailboxId } });
  else mailbox = await chooseSendingMailbox(userId);
  if (!mailbox) {
    const any = await prisma.mailbox.count({ where: { userId } });
    throw new OpError(
      any === 0
        ? "No mailbox yet. Create one in Settings > Mailboxes (or create_mailbox) before sending."
        : "Every mailbox has used its cold allowance for today or is still warming up. Try tomorrow or add a mailbox.",
      429,
    );
  }
  if (mailbox.userId !== userId) throw new OpError("Mailbox not found", 404);
  const notReady = providerReady(mailbox);
  if (notReady) throw new OpError(notReady, 501);
  if (mailbox.status === "PAUSED" || mailbox.status === "DISABLED") throw new OpError(`Mailbox ${mailbox.address} is ${mailbox.status.toLowerCase()}.`, 409);
  if (mailbox.healthScore < 50) throw new OpError(`Mailbox ${mailbox.address} health is ${mailbox.healthScore}/100; sending is paused until it recovers.`, 409);

  // Cold sends are metered (1 credit); replies to a human are not.
  if (!isReply) await ensureCredits(userId, "mail_send");

  // Reserve the slot before the provider call so two concurrent sends cannot
  // both squeeze through the last unit of the cap.
  if (!isReply) {
    const ok = await reserveSlot(mailbox, "cold");
    if (!ok) {
      const s = warmupStateOf(await rolloverCounters(mailbox));
      const cap = coldCapForState(s);
      throw new OpError(
        cap === 0 && mailbox.warmupEnabled && mailbox.warmupDay < COLD_START_DAY
          ? `Mailbox ${mailbox.address} is on warmup day ${mailbox.warmupDay}; cold email opens on day ${COLD_START_DAY}.`
          : `Mailbox ${mailbox.address} has hit today's cold cap (${cap}).`,
        429,
      );
    }
  } else {
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { sentTotal: { increment: 1 } } }).catch(() => {});
  }

  const row = await prisma.mailMessage.create({
    data: {
      userId,
      mailboxId: mailbox.id,
      contactId,
      direction: "OUTBOUND",
      status: "QUEUED",
      fromAddr: mailbox.address,
      toAddr: to,
      subject,
      textBody: text,
      htmlBody: input.html ?? null,
      inReplyTo: replyTo?.rfcMessageId ?? null,
      threadKey: replyTo?.threadKey ?? replyTo?.rfcMessageId ?? null,
      variantId: input.variantId ?? null,
    },
  });

  let sent: ProviderSendResult;
  try {
    sent = await providerSend(mailbox, {
      to,
      subject,
      text,
      html: input.html ?? undefined,
      replyTo: replyTo
        ? { providerMessageId: replyTo.providerMessageId, rfcMessageId: replyTo.rfcMessageId, threadKey: replyTo.threadKey }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isReply) await releaseSlot(mailbox.id, "cold");
    const failed = await prisma.mailMessage.update({ where: { id: row.id }, data: { status: "FAILED", error: msg.slice(0, 1000) } });
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { lastError: msg.slice(0, 500), lastErrorAt: new Date() } }).catch(() => {});
    if (e instanceof OpError) throw e;
    throw Object.assign(new OpError(`Send failed: ${msg}`, 502), { messageId: failed.id });
  }

  if (!isReply) await spendCredits(userId, "mail_send", { ref: row.id }).catch(() => {});

  const now = new Date();
  const message = await prisma.mailMessage.update({
    where: { id: row.id },
    data: {
      status: "SENT",
      sentAt: now,
      providerMessageId: sent.providerMessageId || null,
      rfcMessageId: sent.rfcMessageId,
      threadKey: row.threadKey ?? sent.rfcMessageId ?? sent.providerThreadId ?? sent.providerMessageId,
    },
  });

  // Mirror into the CRM so every existing surface (contact page, list_emails,
  // breakup drafts, bandit attribution) sees the send.
  if (contactId) {
    await prisma.contactEmail.create({
      data: {
        contactId,
        direction: "OUTBOUND",
        fromAddr: mailbox.address,
        toAddr: to,
        subject,
        body: text,
        sentAt: now,
        agentMailMessageId: mailbox.provider === "AGENTMAIL" ? sent.providerMessageId : null,
        agentMailThreadId: mailbox.provider === "AGENTMAIL" ? sent.providerThreadId : null,
      },
    });
    if (!isReply) {
      await logOutreach(userId, {
        contactId,
        summary: `Email sent from ${mailbox.address}: "${subject}"`,
        channel: "email",
        variantId: input.variantId ?? null,
        actor: input.actor ?? null,
      });
    } else {
      await prisma.activity.create({
        data: { userId, contactId, kind: "outreach", channel: "email", body: `Replied from ${mailbox.address}: "${subject}"`, actorId: input.actor?.id ?? null, actorLabel: input.actor?.label ?? null },
      });
    }
  }

  const after = await prisma.mailbox.findUnique({ where: { id: mailbox.id } });
  const remaining = after ? coldRemainingToday(warmupStateOf(after)) : 0;
  return {
    message: toMessageView(message),
    mailbox: { id: mailbox.id, address: mailbox.address, coldRemainingToday: remaining },
    contactId,
  };
}

/* ------------------------------ Reading ------------------------------ */

export interface ListMessagesOpts {
  mailboxId?: string | null;
  contactId?: string | null;
  direction?: "INBOUND" | "OUTBOUND" | null;
  classification?: InboundClassName | null;
  /** Only messages needing a human/agent look: REPLY (default when unset and inbound). */
  since?: Date | null;
  includeWarmup?: boolean;
  limit?: number;
}

export async function listMessages(userId: string, opts: ListMessagesOpts = {}): Promise<MailMessageView[]> {
  const where: Prisma.MailMessageWhereInput = { userId };
  if (opts.mailboxId) where.mailboxId = opts.mailboxId;
  if (opts.contactId) where.contactId = opts.contactId;
  if (opts.direction) where.direction = opts.direction;
  if (opts.classification) where.classification = opts.classification;
  if (opts.since) where.createdAt = { gte: opts.since };
  if (!opts.includeWarmup) where.isWarmup = false;
  const rows = await prisma.mailMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, opts.limit ?? 50)),
  });
  return rows.map(toMessageView);
}

/** Every message in the conversation the given message belongs to, oldest first. */
export async function getThread(userId: string, messageId: string): Promise<MailMessageView[]> {
  const m = await prisma.mailMessage.findUnique({ where: { id: messageId } });
  if (!m || m.userId !== userId) throw new OpError("Message not found", 404);
  const key = m.threadKey ?? m.rfcMessageId;
  if (!key) return [toMessageView(m)];
  const rows = await prisma.mailMessage.findMany({
    where: { userId, mailboxId: m.mailboxId, OR: [{ threadKey: key }, { rfcMessageId: key }] },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toMessageView);
}

/* ------------------------------ Inbound ------------------------------ */

export interface NormalizedInbound {
  providerMessageId: string;
  rfcMessageId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
  from: string;
  to: string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
  receivedAt?: Date | null;
  /** Provider already flagged it as spam / bounce. */
  providerHint?: "spam" | "bounce" | "complaint" | null;
}

export interface IngestResult {
  message: MailMessage | null;
  duplicate: boolean;
  klass: InboundClassName | null;
}

/**
 * Persist one inbound message and apply its CRM side effect. Shared by the
 * AgentMail webhook and the IMAP / API poller, so both paths behave the same.
 */
export async function ingestInbound(mailbox: Mailbox, raw: NormalizedInbound): Promise<IngestResult> {
  const existing = await prisma.mailMessage.findUnique({
    where: { mailboxId_providerMessageId: { mailboxId: mailbox.id, providerMessageId: raw.providerMessageId } },
  });
  if (existing) return { message: existing, duplicate: true, klass: existing.classification as InboundClassName | null };

  const fromAddr = extractAddress(raw.from);
  const headers = raw.headers ?? {};
  const warmupMarker = Boolean(headers[WARMUP_HEADER]) || isWarmupToken(raw.text) || isWarmupToken(raw.subject);
  let { klass, note } = classifyInbound({ fromAddr, subject: raw.subject, text: raw.text, headers, warmupMarker });
  if (raw.providerHint === "bounce") {
    klass = "BOUNCE";
    note = "Provider bounce event";
  }

  // Thread it onto the outbound message it answers, when we can.
  let parent: MailMessage | null = null;
  const candidates = [raw.inReplyTo, ...(raw.references ?? [])].filter((x): x is string => Boolean(x));
  if (candidates.length) {
    parent = await prisma.mailMessage.findFirst({
      where: { mailboxId: mailbox.id, OR: [{ rfcMessageId: { in: candidates } }, { providerMessageId: { in: candidates } }] },
      orderBy: { createdAt: "desc" },
    });
  }
  const threadKey = parent?.threadKey ?? parent?.rfcMessageId ?? raw.references?.[0] ?? raw.rfcMessageId ?? raw.providerMessageId;

  // Link to a contact: the sender for a reply, the original recipient for a bounce.
  let contactId: string | null = parent?.contactId ?? null;
  if (!contactId && klass !== "WARMUP" && fromAddr) {
    const c = await prisma.contact.findFirst({ where: { userId: mailbox.userId, email: { equals: fromAddr, mode: "insensitive" } }, select: { id: true } });
    contactId = c?.id ?? null;
  }
  if (!contactId && klass === "BOUNCE") {
    const addrs = Array.from(new Set((raw.text ?? "").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [])).map((a) => a.toLowerCase()).filter((a) => a !== mailbox.address);
    if (addrs.length) {
      const c = await prisma.contact.findFirst({ where: { userId: mailbox.userId, email: { in: addrs, mode: "insensitive" } }, select: { id: true } });
      contactId = c?.id ?? null;
    }
  }

  const receivedAt = raw.receivedAt ?? new Date();
  const message = await prisma.mailMessage.create({
    data: {
      userId: mailbox.userId,
      mailboxId: mailbox.id,
      contactId: klass === "WARMUP" ? null : contactId,
      direction: "INBOUND",
      status: "RECEIVED",
      providerMessageId: raw.providerMessageId,
      rfcMessageId: raw.rfcMessageId ?? null,
      inReplyTo: raw.inReplyTo ?? null,
      threadKey,
      fromAddr: fromAddr || raw.from,
      toAddr: raw.to[0]?.toLowerCase() ?? mailbox.address,
      subject: raw.subject ?? null,
      textBody: raw.text ?? null,
      htmlBody: raw.html ?? null,
      classification: klass,
      classifierNote: note,
      isWarmup: klass === "WARMUP",
      receivedAt,
    },
  });

  await applyInboundSideEffects(mailbox, message, klass, parent);
  return { message, duplicate: false, klass };
}

async function applyInboundSideEffects(mailbox: Mailbox, message: MailMessage, klass: InboundClassName, parent: MailMessage | null): Promise<void> {
  const userId = mailbox.userId;
  const contactId = message.contactId;

  if (klass === "WARMUP") {
    if (message.inReplyTo || parent) {
      // A peer answered our warmup mail: the signal we wanted.
      await prisma.mailbox.update({ where: { id: mailbox.id }, data: { warmupReplies: { increment: 1 } } });
    } else {
      // A peer opened a warmup conversation with us: answer it, after a
      // human-looking delay, from an Inngest job.
      const delayMs = (5 + Math.floor(Math.random() * 40)) * 60_000;
      await inngest
        .send({ name: "mail/warmup.reply", data: { mailboxId: mailbox.id, messageId: message.id }, ts: Date.now() + delayMs })
        .catch((e) => console.warn("[mail] could not schedule warmup reply", e));
    }
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { taskWebhookUrl: true } });
  const preview = (message.textBody ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;

  if (klass === "BOUNCE") {
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { bounces: { increment: 1 } } });
    if (contactId) {
      await prisma.contact.updateMany({
        where: { id: contactId, doNotContact: false },
        data: { doNotContact: true, doNotContactReason: "bounced", doNotContactAt: new Date() },
      });
      await prisma.activity.create({
        data: { userId, contactId, kind: "note", channel: "email", body: `Email bounced (${mailbox.address}); contact marked do-not-contact.`, actorLabel: "agent mailbox" },
      });
    }
    await notifyTaskWebhook(user?.taskWebhookUrl, {
      event: "mail.bounce",
      mailboxId: mailbox.id,
      mailboxAddress: mailbox.address,
      messageId: message.id,
      contactId,
      fromAddr: message.fromAddr,
      subject: message.subject,
      preview,
      receivedAt: (message.receivedAt ?? message.createdAt).toISOString(),
    });
    return;
  }

  if (!contactId) return; // a stranger wrote in; it's in the inbox, nothing to advance

  await prisma.contactEmail.create({
    data: {
      contactId,
      direction: "INBOUND",
      fromAddr: message.fromAddr,
      toAddr: message.toAddr,
      subject: message.subject,
      body: message.textBody,
      sentAt: message.receivedAt,
      agentMailMessageId: mailbox.provider === "AGENTMAIL" ? message.providerMessageId : null,
    },
  });

  if (klass === "UNSUBSCRIBE") {
    await prisma.contact.updateMany({
      where: { id: contactId, doNotContact: false },
      data: { doNotContact: true, doNotContactReason: "unsubscribed", doNotContactAt: new Date() },
    });
    await prisma.activity.create({
      data: { userId, contactId, kind: "reply", channel: "email", body: `Asked to stop: "${message.subject ?? ""}". Marked do-not-contact.`, actorLabel: "agent mailbox" },
    });
    await notifyTaskWebhook(user?.taskWebhookUrl, {
      event: "mail.unsubscribe",
      mailboxId: mailbox.id,
      mailboxAddress: mailbox.address,
      messageId: message.id,
      contactId,
      fromAddr: message.fromAddr,
      subject: message.subject,
      preview,
      receivedAt: (message.receivedAt ?? message.createdAt).toISOString(),
    });
    return;
  }

  if (klass === "OUT_OF_OFFICE" || klass === "AUTO_REPLY") {
    await prisma.activity.create({
      data: { userId, contactId, kind: "note", channel: "email", body: `${klass === "OUT_OF_OFFICE" ? "Out of office" : "Auto-reply"}: "${message.subject ?? ""}"`, actorLabel: "agent mailbox" },
    });
    return;
  }

  // REPLY (and OTHER from a known contact): a human wrote back.
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { status: true } });
  const becomesReplied = contact?.status === "CONTACTED";
  await prisma.$transaction([
    prisma.contact.update({ where: { id: contactId }, data: becomesReplied ? { status: "REPLIED" } : {} }),
    prisma.activity.create({
      data: { userId, contactId, kind: "reply", channel: "email", body: `Replied to ${mailbox.address}: "${message.subject ?? ""}"`, actorLabel: "agent mailbox" },
    }),
  ]);
  if (becomesReplied) await attributeReply(contactId);
  await notifyTaskWebhook(user?.taskWebhookUrl, {
    event: "mail.reply",
    mailboxId: mailbox.id,
    mailboxAddress: mailbox.address,
    messageId: message.id,
    contactId,
    fromAddr: message.fromAddr,
    subject: message.subject,
    preview,
    receivedAt: (message.receivedAt ?? message.createdAt).toISOString(),
  });
}

/** Poll a mailbox for new inbound mail (IMAP for SMTP mailboxes, the messages
 *  API for AgentMail when no webhook is wired). Returns how many were new. */
export async function syncMailbox(mailboxId: string): Promise<{ ingested: number; rescued: number }> {
  const m = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!m) return { ingested: 0, rescued: 0 };
  const notReady = providerReady(m);
  if (notReady) return { ingested: 0, rescued: 0 };

  let ingested = 0;
  let rescued = 0;
  try {
    if (m.provider === "SMTP") {
      if (!m.imapHost) return { ingested: 0, rescued: 0 };
      const creds = smtpCredentials(m);
      const since = Number.parseInt(m.syncCursor ?? "0", 10) || 0;
      const r = await imapFetchNew(creds, since, { limit: 50, warmupHeader: WARMUP_HEADER });
      for (const msg of r.messages) {
        if (msg.from.toLowerCase() === m.address) continue; // our own copy
        const res = await ingestInbound(m, {
          providerMessageId: `uid:${msg.uid}`,
          rfcMessageId: msg.rfcMessageId ?? null,
          inReplyTo: msg.inReplyTo ?? null,
          references: msg.references,
          from: msg.from,
          to: msg.to,
          subject: msg.subject ?? null,
          text: msg.text ?? null,
          html: msg.html ?? null,
          headers: msg.headers,
          receivedAt: msg.date ?? null,
        });
        if (!res.duplicate) ingested++;
      }
      rescued = r.rescuedFromSpam;
      await prisma.mailbox.update({
        where: { id: m.id },
        data: {
          syncCursor: String(r.lastUid),
          lastSyncedAt: new Date(),
          ...(rescued ? { warmupSpamSaved: { increment: rescued } } : {}),
          lastError: null,
        },
      });
    } else {
      const key = agentmail.platformAgentMailKey()!;
      const msgs = await agentmail.listReceivedMessages(key, m.providerInboxId!, { after: m.syncCursor ?? undefined, limit: 50 });
      let cursor = m.syncCursor ?? null;
      for (const msg of msgs) {
        const res = await ingestInbound(m, {
          providerMessageId: msg.messageId,
          rfcMessageId: msg.rfcMessageId ?? null,
          inReplyTo: msg.inReplyTo ?? null,
          references: msg.references.length ? msg.references : msg.threadId ? [msg.threadId] : null,
          from: msg.from,
          to: msg.to,
          subject: msg.subject ?? null,
          text: msg.text ?? null,
          html: msg.html ?? null,
          headers: msg.headers,
          receivedAt: msg.timestamp ? new Date(msg.timestamp) : null,
          providerHint: msg.labels.includes("spam") ? "spam" : null,
        });
        if (!res.duplicate) ingested++;
        if (msg.timestamp && (!cursor || msg.timestamp > cursor)) cursor = msg.timestamp;
      }
      await prisma.mailbox.update({ where: { id: m.id }, data: { syncCursor: cursor, lastSyncedAt: new Date(), lastError: null } });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[mail] sync ${m.address} failed: ${msg}`);
    await prisma.mailbox.update({ where: { id: m.id }, data: { lastError: msg.slice(0, 500), lastErrorAt: new Date() } }).catch(() => {});
  }
  return { ingested, rescued };
}

/** Handle one AgentMail webhook event (already signature-verified). */
export async function handleAgentMailEvent(event: Record<string, unknown>): Promise<{ handled: boolean; detail?: string }> {
  const type = typeof event.event_type === "string" ? event.event_type : "";
  if (type.startsWith("message.received")) {
    const raw = event.message as Record<string, unknown> | undefined;
    if (!raw) return { handled: false, detail: "no message" };
    const msg = agentmail.parseMessage(raw);
    const m = await prisma.mailbox.findFirst({ where: { provider: "AGENTMAIL", providerInboxId: msg.inboxId } });
    if (!m) return { handled: false, detail: "unknown inbox" };
    const res = await ingestInbound(m, {
      providerMessageId: msg.messageId,
      rfcMessageId: msg.rfcMessageId ?? null,
      inReplyTo: msg.inReplyTo ?? null,
      references: msg.references.length ? msg.references : msg.threadId ? [msg.threadId] : null,
      from: msg.from,
      to: msg.to,
      subject: msg.subject ?? null,
      text: msg.text ?? null,
      html: msg.html ?? null,
      headers: msg.headers,
      receivedAt: msg.timestamp ? new Date(msg.timestamp) : null,
      providerHint: type === "message.received.spam" ? "spam" : null,
    });
    return { handled: true, detail: res.duplicate ? "duplicate" : res.klass ?? undefined };
  }
  if (type === "message.bounced" || type === "message.complained") {
    const b = (event.bounce ?? event.complaint) as Record<string, unknown> | undefined;
    const inboxId = typeof b?.inbox_id === "string" ? b.inbox_id : null;
    const messageId = typeof b?.message_id === "string" ? b.message_id : null;
    if (!inboxId) return { handled: false, detail: "no inbox" };
    const m = await prisma.mailbox.findFirst({ where: { provider: "AGENTMAIL", providerInboxId: inboxId } });
    if (!m) return { handled: false, detail: "unknown inbox" };
    const original = messageId
      ? await prisma.mailMessage.findUnique({ where: { mailboxId_providerMessageId: { mailboxId: m.id, providerMessageId: messageId } } })
      : null;
    await prisma.mailbox.update({
      where: { id: m.id },
      data: type === "message.bounced" ? { bounces: { increment: 1 } } : { complaints: { increment: 1 } },
    });
    if (original?.contactId && type === "message.bounced") {
      await prisma.contact.updateMany({
        where: { id: original.contactId, doNotContact: false },
        data: { doNotContact: true, doNotContactReason: "bounced", doNotContactAt: new Date() },
      });
      await prisma.mailMessage.update({ where: { id: original.id }, data: { error: "bounced" } }).catch(() => {});
    }
    if (original?.contactId && type === "message.complained") {
      await prisma.contact.updateMany({
        where: { id: original.contactId, doNotContact: false },
        data: { doNotContact: true, doNotContactReason: "spam complaint", doNotContactAt: new Date() },
      });
    }
    return { handled: true, detail: type };
  }
  if (type === "domain.verified") {
    const d = event.domain as Record<string, unknown> | undefined;
    const name = typeof d?.domain === "string" ? d.domain.toLowerCase() : null;
    if (name) {
      const rows = await prisma.mailDomain.findMany({ where: { domain: name, providerDomainId: { not: null } } });
      for (const row of rows) await verifyDomainDns(row.userId, row.id).catch(() => {});
    }
    return { handled: true, detail: "domain.verified" };
  }
  return { handled: false, detail: `ignored ${type}` };
}

/* ------------------------------ Warmup ------------------------------ */

function warmupToken(): string {
  return `${WARMUP_TOKEN_PREFIX}${randomBytes(6).toString("hex")}`;
}

async function sendWarmup(from: Mailbox, to: Mailbox, opts: { replyTo?: MailMessage | null }): Promise<boolean> {
  if (!(await reserveSlot(from, "warmup"))) return false;
  const token = warmupToken();
  const seed = Math.floor(Math.random() * 1_000_000);
  const body = opts.replyTo
    ? { subject: opts.replyTo.subject ? `Re: ${opts.replyTo.subject.replace(/^re:\s*/i, "")}` : "Re:", text: warmupReply(seed, token, from.displayName) }
    : warmupMessage(seed, token, from.displayName);
  const row = await prisma.mailMessage.create({
    data: {
      userId: from.userId,
      mailboxId: from.id,
      direction: "OUTBOUND",
      status: "QUEUED",
      fromAddr: from.address,
      toAddr: to.address,
      subject: body.subject,
      textBody: body.text,
      isWarmup: true,
      inReplyTo: opts.replyTo?.rfcMessageId ?? null,
      threadKey: opts.replyTo?.threadKey ?? null,
    },
  });
  try {
    const sent = await providerSend(from, {
      to: to.address,
      subject: body.subject,
      text: body.text,
      headers: { "X-Scalar-Warmup": token },
      replyTo: opts.replyTo
        ? { providerMessageId: opts.replyTo.providerMessageId, rfcMessageId: opts.replyTo.rfcMessageId, threadKey: opts.replyTo.threadKey }
        : null,
    });
    await prisma.mailMessage.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: sent.providerMessageId || null,
        rfcMessageId: sent.rfcMessageId,
        threadKey: row.threadKey ?? sent.rfcMessageId ?? sent.providerThreadId ?? sent.providerMessageId,
      },
    });
    await prisma.mailbox.update({ where: { id: from.id }, data: { warmupSent: { increment: 1 }, lastError: null } });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await releaseSlot(from.id, "warmup");
    await prisma.mailMessage.update({ where: { id: row.id }, data: { status: "FAILED", error: msg.slice(0, 1000) } }).catch(() => {});
    await prisma.mailbox.update({ where: { id: from.id }, data: { lastError: msg.slice(0, 500), lastErrorAt: new Date() } }).catch(() => {});
    return false;
  }
}

/** Answer a peer's warmup message (scheduled by ingestInbound). */
export async function sendWarmupReply(mailboxId: string, messageId: string): Promise<boolean> {
  const [m, msg] = await Promise.all([
    prisma.mailbox.findUnique({ where: { id: mailboxId } }),
    prisma.mailMessage.findUnique({ where: { id: messageId } }),
  ]);
  if (!m || !msg || !msg.isWarmup || msg.direction !== "INBOUND") return false;
  if (providerReady(m) || m.status === "PAUSED" || m.status === "DISABLED") return false;
  const peer = await prisma.mailbox.findFirst({ where: { address: msg.fromAddr.toLowerCase() } });
  if (!peer) return false;
  return sendWarmup(m, peer, { replyTo: msg });
}

/**
 * One warmup pass over every mailbox in the pool: advance warmup days,
 * recompute health, and send this hour's share of warmup mail to peers.
 * Runs hourly from Inngest; sends are spread across the remaining UTC hours
 * so the pattern looks like a person, not a cron.
 */
export async function runWarmupTick(now = new Date()): Promise<{ mailboxes: number; sent: number; skipped: string[] }> {
  const all = await prisma.mailbox.findMany({ where: { status: { in: ["WARMING", "ACTIVE", "PROVISIONING"] } } });
  const today = utcMidnight(now);
  const skipped: string[] = [];
  const pool: Mailbox[] = [];

  for (let m of all) {
    if (m.status === "PROVISIONING") continue;
    m = await rolloverCounters(m, today);
    const day = m.warmupStartedAt ? Math.floor((now.getTime() - m.warmupStartedAt.getTime()) / 86_400_000) : m.warmupDay;
    const health = computeHealthScore({
      sent: m.sentTotal,
      bounces: m.bounces,
      complaints: m.complaints,
      warmupSent: m.warmupSent,
      warmupReplies: m.warmupReplies,
      warmupSpamSaved: m.warmupSpamSaved,
    });
    const status = statusForWarmupDay(m.status, day, m.warmupEnabled);
    if (day !== m.warmupDay || health !== m.healthScore || status !== m.status) {
      m = await prisma.mailbox.update({ where: { id: m.id }, data: { warmupDay: day, healthScore: health, status } });
    }
    if (providerReady(m)) {
      skipped.push(`${m.address}: ${providerReady(m)}`);
      continue;
    }
    pool.push(m);
  }

  let sent = 0;
  if (pool.length < 2) return { mailboxes: pool.length, sent, skipped: [...skipped, "pool has fewer than two mailboxes; warmup needs peers"] };

  const hoursLeft = Math.max(1, 24 - now.getUTCHours());
  for (const m of pool) {
    if (!m.warmupEnabled) continue;
    const remaining = warmupRemainingToday(warmupStateOf(m, today));
    if (remaining <= 0) continue;
    const share = Math.max(1, Math.ceil(remaining / hoursLeft));
    // Prefer peers on other accounts / other domains: mail between two
    // inboxes on the same domain teaches the receiving provider nothing.
    const peers = pool.filter((p) => p.id !== m.id && (p.userId !== m.userId || p.domainId !== m.domainId));
    const fallback = pool.filter((p) => p.id !== m.id);
    const targets = (peers.length ? peers : fallback).sort(() => Math.random() - 0.5).slice(0, share);
    for (const t of targets) {
      if (await sendWarmup(m, t, {})) sent++;
    }
  }
  return { mailboxes: pool.length, sent, skipped };
}

/* ------------------------------ Domains ------------------------------ */

export interface MailDomainView {
  id: string;
  domain: string;
  registrar: MailDomain["registrar"];
  status: MailDomain["status"];
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  mxOk: boolean;
  dnsCheckedAt: Date | null;
  connectedToAgentMail: boolean;
  dnsRecords: DnsRecordInput[];
  findings: string[];
  mailboxCount: number;
  purchasedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function recordsOf(d: MailDomain): DnsRecordInput[] {
  const j = d.dnsRecords as unknown;
  if (!j || typeof j !== "object") return [];
  const arr = Array.isArray(j) ? j : (j as { records?: unknown }).records;
  return Array.isArray(arr) ? (arr as DnsRecordInput[]) : [];
}

function findingsOf(d: MailDomain): string[] {
  const j = d.dnsRecords as unknown;
  if (!j || typeof j !== "object" || Array.isArray(j)) return [];
  const f = (j as { findings?: unknown }).findings;
  return Array.isArray(f) ? f.filter((x): x is string => typeof x === "string") : [];
}

export async function toDomainView(d: MailDomain): Promise<MailDomainView> {
  const mailboxCount = await prisma.mailbox.count({ where: { domainId: d.id } });
  return {
    id: d.id,
    domain: d.domain,
    registrar: d.registrar,
    status: d.status,
    spfOk: d.spfOk,
    dkimOk: d.dkimOk,
    dmarcOk: d.dmarcOk,
    mxOk: d.mxOk,
    dnsCheckedAt: d.dnsCheckedAt,
    connectedToAgentMail: Boolean(d.providerDomainId),
    dnsRecords: recordsOf(d),
    findings: findingsOf(d),
    mailboxCount,
    purchasedAt: d.purchasedAt,
    expiresAt: d.expiresAt,
    createdAt: d.createdAt,
  };
}

export async function listDomains(userId: string): Promise<MailDomainView[]> {
  const rows = await prisma.mailDomain.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return Promise.all(rows.map(toDomainView));
}

/** Bring a domain the account already owns elsewhere; we only verify DNS. */
export async function addExternalDomain(userId: string, input: { domain: string }): Promise<MailDomainView> {
  const domain = normalizeDomain(input.domain);
  if (!isValidDomain(domain)) throw new OpError("That does not look like a domain name.", 400);
  const dup = await prisma.mailDomain.findUnique({ where: { userId_domain: { userId, domain } } });
  if (dup) throw new OpError("Domain already added.", 409);
  const row = await prisma.mailDomain.create({ data: { userId, domain, registrar: "EXTERNAL", status: "PURCHASED" } });
  return verifyDomainDns(userId, row.id);
}

/** Real DNS lookups; flips status to VERIFIED only when the records resolve. */
export async function verifyDomainDns(userId: string, id: string): Promise<MailDomainView> {
  const d = await ownedDomain(userId, id);
  const posture = await checkDomainDns(d.domain, d.dkimSelector);

  let providerVerified = false;
  let records = recordsOf(d);
  if (d.providerDomainId && agentmail.isAgentMailPlatformConfigured()) {
    try {
      const pd = await agentmail.verifyDomain(agentmail.platformAgentMailKey()!, d.providerDomainId);
      providerVerified = pd.status === "VERIFIED";
      records = mergeProviderRecords(records, pd.records);
    } catch (e) {
      posture.findings.push(`AgentMail check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const dkimOk = posture.dkimOk || providerVerified;
  const verified = posture.spfOk && posture.dmarcOk && posture.mxOk && dkimOk;
  const status: MailDomain["status"] = d.status === "PENDING_PURCHASE" || d.status === "FAILED" ? d.status : verified ? "VERIFIED" : "PURCHASED";
  const row = await prisma.mailDomain.update({
    where: { id },
    data: {
      spfOk: posture.spfOk,
      dkimOk,
      dmarcOk: posture.dmarcOk,
      mxOk: posture.mxOk,
      dnsCheckedAt: new Date(),
      status,
      dnsRecords: { records, findings: posture.findings } as unknown as Prisma.InputJsonValue,
    },
  });
  return toDomainView(row);
}

function mergeProviderRecords(existing: DnsRecordInput[], provider: agentmail.AgentMailDnsRecord[]): DnsRecordInput[] {
  const out = [...existing];
  for (const r of provider) {
    const type = r.type.toUpperCase() as DnsRecordInput["type"];
    if (!["TXT", "CNAME", "MX", "A", "AAAA"].includes(type)) continue;
    const name = r.name;
    if (out.some((x) => x.type === type && x.name === name && x.data === r.value)) continue;
    out.push({ type, name, data: r.value, ttl: 600, priority: r.priority });
  }
  return out;
}

/** Relative record name ("@", "_dmarc", "x._domainkey") from an absolute one. */
function relativeName(fqdn: string, domain: string): string {
  const n = fqdn.replace(/\.$/, "").toLowerCase();
  if (n === domain) return "@";
  return n.endsWith(`.${domain}`) ? n.slice(0, -(domain.length + 1)) : n;
}

/**
 * Register the domain with AgentMail so inboxes can live on it; store the
 * records AgentMail wants, and push them to the registrar automatically when
 * Scalar bought the domain. External domains get the record list to paste.
 */
export async function connectDomainToAgentMail(userId: string, id: string): Promise<MailDomainView> {
  const key = agentmail.platformAgentMailKey();
  if (!key) throw new OpError("AgentMail is not configured on this deployment (AGENTMAIL_API_KEY).", 501);
  const d = await ownedDomain(userId, id);
  if (d.status === "PENDING_PURCHASE") throw new OpError("Domain purchase has not completed yet.", 409);

  const pd = await agentmail.createDomain(key, d.domain);
  const records: DnsRecordInput[] = pd.records
    .map((r) => ({
      type: r.type.toUpperCase() as DnsRecordInput["type"],
      name: relativeName(r.name, d.domain),
      data: r.value,
      ttl: 600,
      priority: r.priority,
    }))
    .filter((r) => ["TXT", "CNAME", "MX"].includes(r.type));
  for (const b of baselineDnsRecords(d.domain)) {
    if (!records.some((r) => r.type === b.type && r.name === b.name)) records.push(b);
  }
  const dkim = records.find((r) => /_domainkey$/.test(r.name));
  const dkimSelector = dkim ? dkim.name.replace(/\._domainkey$/, "") : d.dkimSelector;

  await prisma.mailDomain.update({
    where: { id },
    data: {
      providerDomainId: pd.domainId || d.domain,
      dkimSelector,
      dnsRecords: { records, findings: [] } as unknown as Prisma.InputJsonValue,
    },
  });

  if (d.registrar !== "EXTERNAL") await pushDnsRecords(userId, id).catch((e) => console.warn(`[mail] pushDnsRecords ${d.domain}`, e));
  return verifyDomainDns(userId, id);
}

/** Write the stored records to the registrar (only for domains Scalar bought). */
export async function pushDnsRecords(userId: string, id: string): Promise<{ pushed: number }> {
  const d = await ownedDomain(userId, id);
  if (d.registrar === "EXTERNAL") throw new OpError("This domain is managed elsewhere; add the records at your DNS host.", 409);
  const reg = configuredRegistrar();
  if (!reg || reg.id !== d.registrar) throw new OpError(`Registrar ${d.registrar} is not configured on this deployment.`, 501);
  const records = recordsOf(d);
  if (!records.length) return { pushed: 0 };
  try {
    await reg.setRecords(d.domain, records);
  } catch (e) {
    if (e instanceof RegistrarError) throw new OpError(e.message, e.status);
    throw e;
  }
  return { pushed: records.length };
}

export async function deleteDomain(userId: string, id: string): Promise<{ ok: true }> {
  const d = await ownedDomain(userId, id);
  const n = await prisma.mailbox.count({ where: { domainId: d.id } });
  if (n > 0) throw new OpError("Remove the mailboxes on this domain first.", 409);
  await prisma.mailDomain.delete({ where: { id } });
  return { ok: true };
}

/* ------------------------------ Orders ------------------------------ */

export interface DomainQuote {
  domain: string;
  available: boolean;
  premium: boolean;
  registrar: string | null;
  priceUsdCents: number | null; // what the customer pays for year one
}

export async function quoteDomain(domain: string): Promise<DomainQuote> {
  const d = normalizeDomain(domain);
  if (!isValidDomain(d)) throw new OpError("That does not look like a domain name.", 400);
  const reg = configuredRegistrar();
  if (!reg) throw new OpError("Domain purchasing is not configured on this deployment (no registrar credentials).", 501);
  try {
    const a = await reg.checkAvailability(d);
    const price = a.available ? (a.priceUsdCents !== null ? a.priceUsdCents + DOMAIN_MARKUP_USD_CENTS() : DOMAIN_FALLBACK_PRICE_USD_CENTS()) : null;
    return { domain: d, available: a.available && !a.premium, premium: a.premium, registrar: reg.id, priceUsdCents: price };
  } catch (e) {
    if (e instanceof RegistrarError) throw new OpError(e.message, e.status);
    throw e;
  }
}

export interface OrderView {
  id: string;
  kind: MailboxOrder["kind"];
  status: MailboxOrder["status"];
  vendor: string;
  domain: string | null;
  quantity: number;
  amountUsdCents: number;
  note: string | null;
  checkoutUrl?: string;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  createdAt: Date;
}

export function toOrderView(o: MailboxOrder, checkoutUrl?: string): OrderView {
  return {
    id: o.id,
    kind: o.kind,
    status: o.status,
    vendor: o.vendor,
    domain: o.domain,
    quantity: o.quantity,
    amountUsdCents: o.amountUsdCents,
    note: o.note,
    checkoutUrl,
    paidAt: o.paidAt,
    fulfilledAt: o.fulfilledAt,
    createdAt: o.createdAt,
  };
}

export async function listOrders(userId: string): Promise<OrderView[]> {
  const rows = await prisma.mailboxOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((o) => toOrderView(o));
}

function validateContact(c: Partial<RegistrantContact> | undefined): RegistrantContact {
  const need = ["firstName", "lastName", "email", "phone", "address1", "city", "state", "postalCode", "country"] as const;
  for (const k of need) {
    if (!c || typeof c[k] !== "string" || !(c[k] as string).trim()) throw new OpError(`Registrant contact is missing ${k}.`, 400);
  }
  const cc = c as RegistrantContact;
  if (!isValidEmail(cc.email)) throw new OpError("Registrant email is invalid.", 400);
  if (!/^[A-Z]{2}$/.test(cc.country.toUpperCase())) throw new OpError("Registrant country must be a 2-letter ISO code.", 400);
  return { ...cc, country: cc.country.toUpperCase() };
}

/**
 * Start a domain purchase: quote, create the PENDING domain + order, and hand
 * back a Stripe Checkout URL. Fulfilment (the registrar call) happens only
 * after checkout.session.completed, from Inngest.
 */
export async function createDomainOrder(
  userId: string,
  input: { domain: string; contact: Partial<RegistrantContact>; successUrl: string; cancelUrl: string },
): Promise<OrderView> {
  if (!stripeConfigured()) throw new OpError("Billing is not configured yet.", 501);
  const quote = await quoteDomain(input.domain);
  if (!quote.available || quote.priceUsdCents === null) throw new OpError(`${quote.domain} is not available.`, 409);
  const contact = validateContact(input.contact);

  const existing = await prisma.mailDomain.findUnique({ where: { userId_domain: { userId, domain: quote.domain } } });
  if (existing && existing.status !== "FAILED") throw new OpError("You already have this domain.", 409);

  const order = await prisma.mailboxOrder.create({
    data: {
      userId,
      kind: "DOMAIN",
      status: "PENDING",
      vendor: (quote.registrar ?? "registrar").toLowerCase(),
      domain: quote.domain,
      quantity: 1,
      amountUsdCents: quote.priceUsdCents,
      costUsdCents: Math.max(0, quote.priceUsdCents - DOMAIN_MARKUP_USD_CENTS()),
      detail: { contact } as unknown as Prisma.InputJsonValue,
    },
  });
  if (existing) {
    await prisma.mailDomain.update({ where: { id: existing.id }, data: { status: "PENDING_PURCHASE", registrar: quote.registrar as MailDomain["registrar"] } });
  } else {
    await prisma.mailDomain.create({
      data: { userId, domain: quote.domain, registrar: quote.registrar as MailDomain["registrar"], status: "PENDING_PURCHASE" },
    });
  }

  const session = await createOrderCheckoutSession({
    userId,
    orderId: order.id,
    description: `Sending domain ${quote.domain} (1 year, WHOIS privacy, DNS managed by Scalar)`,
    amountUsdCents: quote.priceUsdCents,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });
  if ("error" in session) {
    await prisma.mailboxOrder.update({ where: { id: order.id }, data: { status: "FAILED", note: session.error } });
    throw new OpError(session.error, session.status);
  }
  const updated = await prisma.mailboxOrder.update({ where: { id: order.id }, data: { stripeSessionId: session.sessionId ?? null } });
  return toOrderView(updated, session.url);
}

export type InboxVendor = "agentmail" | "premiuminboxes";

/**
 * Order inboxes on a domain. AgentMail inboxes are provisioned by API on
 * payment; PremiumInboxes has no API, so the order stops at ACTION_REQUIRED
 * with instructions and the credentials get imported when they arrive.
 */
export async function createInboxOrder(
  userId: string,
  input: { domainId?: string | null; quantity: number; vendor: InboxVendor; usernames?: string[]; displayName?: string | null; successUrl: string; cancelUrl: string },
): Promise<OrderView> {
  if (!stripeConfigured()) throw new OpError("Billing is not configured yet.", 501);
  const quantity = Math.round(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10) throw new OpError("Order between 1 and 10 inboxes at a time.", 400);
  await assertMailboxBudget(userId, quantity);

  let domain: MailDomain | null = null;
  if (input.domainId) {
    domain = await ownedDomain(userId, input.domainId);
    if (domain.status === "PENDING_PURCHASE" || domain.status === "FAILED") throw new OpError("That domain is not ready for inboxes yet.", 409);
    const onDomain = await prisma.mailbox.count({ where: { domainId: domain.id } });
    if (onDomain + quantity > MAX_INBOXES_PER_DOMAIN) {
      throw new OpError(`That would put ${onDomain + quantity} inboxes on ${domain.domain}; keep it to ${MAX_INBOXES_PER_DOMAIN} per domain for deliverability.`, 409);
    }
  }
  if (input.vendor === "agentmail") {
    if (!agentmail.isAgentMailPlatformConfigured()) throw new OpError("AgentMail is not configured on this deployment.", 501);
    if (domain && !domain.providerDomainId) throw new OpError("Connect the domain to AgentMail first.", 409);
  }
  if (input.vendor === "premiuminboxes" && !isSecretBoxConfigured()) {
    throw new OpError("MAILBOX_SECRET_KEY is not configured; imported inbox credentials could not be stored.", 501);
  }
  const usernames = (input.usernames ?? []).map((u) => u.trim().toLowerCase()).filter(Boolean);
  for (const u of usernames) if (!USERNAME_RE.test(u)) throw new OpError(`Invalid username "${u}".`, 400);
  if (usernames.length && usernames.length !== quantity) throw new OpError("Provide one username per inbox, or none.", 400);

  const unit = INBOX_PRICE_USD_CENTS();
  const order = await prisma.mailboxOrder.create({
    data: {
      userId,
      kind: "INBOXES",
      status: "PENDING",
      vendor: input.vendor,
      domain: domain?.domain ?? null,
      quantity,
      amountUsdCents: unit * quantity,
      detail: { domainId: domain?.id ?? null, usernames, displayName: input.displayName ?? null } as unknown as Prisma.InputJsonValue,
    },
  });
  const session = await createOrderCheckoutSession({
    userId,
    orderId: order.id,
    description: `${quantity} agent inbox${quantity === 1 ? "" : "es"}${domain ? ` on ${domain.domain}` : ""} (${input.vendor === "agentmail" ? "AgentMail" : "PremiumInboxes"}, first month)`,
    amountUsdCents: unit,
    quantity,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });
  if ("error" in session) {
    await prisma.mailboxOrder.update({ where: { id: order.id }, data: { status: "FAILED", note: session.error } });
    throw new OpError(session.error, session.status);
  }
  const updated = await prisma.mailboxOrder.update({ where: { id: order.id }, data: { stripeSessionId: session.sessionId ?? null } });
  return toOrderView(updated, session.url);
}

/** Stripe webhook: the customer paid. Idempotent; kicks off fulfilment. */
export async function markOrderPaid(orderId: string, sessionId?: string | null): Promise<void> {
  const o = await prisma.mailboxOrder.findUnique({ where: { id: orderId } });
  if (!o) return;
  if (o.status !== "PENDING") return;
  await prisma.mailboxOrder.update({
    where: { id: orderId },
    data: { status: "PAID", paidAt: new Date(), ...(sessionId ? { stripeSessionId: sessionId } : {}) },
  });
  await inngest.send({ name: "mail/order.paid", data: { orderId } });
}

/** Inngest: do the vendor work for a PAID order. Safe to re-run. */
export async function fulfillOrder(orderId: string): Promise<OrderView> {
  const o = await prisma.mailboxOrder.findUnique({ where: { id: orderId } });
  if (!o) throw new OpError("Order not found", 404);
  if (o.status !== "PAID") return toOrderView(o);
  const detail = (o.detail ?? {}) as Record<string, unknown>;

  const fail = async (note: string) => {
    const row = await prisma.mailboxOrder.update({ where: { id: orderId }, data: { status: "FAILED", note } });
    return toOrderView(row);
  };

  if (o.kind === "DOMAIN") {
    const reg = configuredRegistrar();
    if (!reg || !o.domain) return fail("Registrar not configured at fulfilment time; refund needed.");
    const domainRow = await prisma.mailDomain.findUnique({ where: { userId_domain: { userId: o.userId, domain: o.domain } } });
    try {
      const contact = validateContact(detail.contact as Partial<RegistrantContact>);
      const r = await reg.purchase(o.domain, contact, { years: 1, privacy: true, idempotencyKey: o.id });
      const purchasedAt = new Date();
      const expiresAt = r.expiresAt ?? new Date(purchasedAt.getTime() + 365 * 86_400_000);
      const d = domainRow
        ? await prisma.mailDomain.update({
            where: { id: domainRow.id },
            data: { status: "PURCHASED", registrar: reg.id, registrarOrderRef: r.orderRef, purchasedAt, expiresAt },
          })
        : await prisma.mailDomain.create({
            data: { userId: o.userId, domain: o.domain, registrar: reg.id, status: "PURCHASED", registrarOrderRef: r.orderRef, purchasedAt, expiresAt },
          });
      // Baseline DMARC right away; the rest comes with the mailbox provider.
      await prisma.mailDomain.update({
        where: { id: d.id },
        data: { dnsRecords: { records: baselineDnsRecords(d.domain), findings: [] } as unknown as Prisma.InputJsonValue },
      });
      await pushDnsRecords(o.userId, d.id).catch((e) => console.warn(`[mail] baseline DNS for ${d.domain} failed`, e));
      if (agentmail.isAgentMailPlatformConfigured()) {
        await connectDomainToAgentMail(o.userId, d.id).catch((e) => console.warn(`[mail] AgentMail connect for ${d.domain} failed`, e));
      }
      const row = await prisma.mailboxOrder.update({
        where: { id: orderId },
        data: { status: "FULFILLED", fulfilledAt: new Date(), vendorOrderRef: r.orderRef, note: r.status === "PENDING" ? "Registrar is completing the registration; DNS may take a few minutes." : null },
      });
      return toOrderView(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (domainRow) await prisma.mailDomain.update({ where: { id: domainRow.id }, data: { status: "FAILED" } }).catch(() => {});
      return fail(`Registrar purchase failed: ${msg}. The payment must be refunded manually.`);
    }
  }

  // INBOXES
  const domainId = typeof detail.domainId === "string" ? detail.domainId : null;
  const usernames = Array.isArray(detail.usernames) ? (detail.usernames as string[]) : [];
  const displayName = typeof detail.displayName === "string" ? detail.displayName : null;

  if (o.vendor === "premiuminboxes") {
    const row = await prisma.mailboxOrder.update({
      where: { id: orderId },
      data: {
        status: "ACTION_REQUIRED",
        note:
          `PremiumInboxes has no ordering API. Place the order at premiuminboxes.com for ${o.quantity} inbox${o.quantity === 1 ? "" : "es"}` +
          `${o.domain ? ` on ${o.domain}` : ""}, then import the CSV they deliver (address, app password, SMTP/IMAP hosts) under Settings > Mailboxes > Import. ` +
          `Each imported inbox starts warming automatically.`,
      },
    });
    return toOrderView(row);
  }

  // agentmail
  let created = 0;
  const errors: string[] = [];
  for (let i = 0; i < o.quantity; i++) {
    const username = usernames[i] ?? `${(displayName ?? "hello").split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "hello"}${i === 0 ? "" : i + 1}`;
    try {
      const mb = await createAgentMailMailbox(o.userId, { username, domainId, displayName });
      await prisma.mailbox.update({ where: { id: mb.id }, data: { orderId } });
      created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already have a mailbox/i.test(msg)) {
        created++;
        continue;
      }
      errors.push(`${username}: ${msg}`);
    }
  }
  const row = await prisma.mailboxOrder.update({
    where: { id: orderId },
    data:
      created === o.quantity
        ? { status: "FULFILLED", fulfilledAt: new Date(), note: null }
        : { status: created > 0 ? "ACTION_REQUIRED" : "FAILED", note: `Created ${created}/${o.quantity}. ${errors.join(" | ")}`.slice(0, 1000) },
  });
  return toOrderView(row);
}

/* --------------------- Credential import (PremiumInboxes) --------------------- */

export interface InboxCredentialRow {
  address: string;
  password: string;
  displayName?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  imapHost?: string | null;
  imapPort?: number | null;
}

const COL = {
  address: ["email", "email address", "address", "mailbox", "login", "username", "user"],
  password: ["password", "app password", "app_password", "pass", "smtp password"],
  first: ["first name", "firstname", "first"],
  last: ["last name", "lastname", "last"],
  name: ["name", "display name", "sender name", "from name"],
  smtpHost: ["smtp host", "smtp_host", "smtp server", "smtp"],
  smtpPort: ["smtp port", "smtp_port"],
  imapHost: ["imap host", "imap_host", "imap server", "imap"],
  imapPort: ["imap port", "imap_port"],
} as const;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parse the CSV vendors deliver. Header-driven; tolerant of column order. */
export function parseInboxCsv(text: string): InboxCredentialRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[_-]+/g, " ").trim());
  const idx = (names: readonly string[]) => header.findIndex((h) => names.includes(h));
  const iAddr = idx(COL.address);
  const iPass = idx(COL.password);
  if (iAddr < 0 || iPass < 0) return [];
  const iFirst = idx(COL.first);
  const iLast = idx(COL.last);
  const iName = idx(COL.name);
  const iSh = idx(COL.smtpHost);
  const iSp = idx(COL.smtpPort);
  const iIh = idx(COL.imapHost);
  const iIp = idx(COL.imapPort);
  const rows: InboxCredentialRow[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const address = (c[iAddr] ?? "").toLowerCase();
    const password = c[iPass] ?? "";
    if (!isValidEmail(address) || !password) continue;
    const name = iName >= 0 ? c[iName] : [iFirst >= 0 ? c[iFirst] : "", iLast >= 0 ? c[iLast] : ""].filter(Boolean).join(" ");
    const port = (i: number) => (i >= 0 && c[i] ? Number.parseInt(c[i], 10) || null : null);
    rows.push({
      address,
      password,
      displayName: name || null,
      smtpHost: iSh >= 0 ? c[iSh] || null : null,
      smtpPort: port(iSp),
      imapHost: iIh >= 0 ? c[iIh] || null : null,
      imapPort: port(iIp),
    });
  }
  return rows;
}

export async function importInboxCredentials(
  userId: string,
  input: { orderId?: string | null; rows: InboxCredentialRow[]; providerHint?: "google" | "microsoft" | null; skipVerify?: boolean },
): Promise<{ imported: MailboxView[]; failed: { address: string; error: string }[]; order: OrderView | null }> {
  if (!input.rows.length) throw new OpError("No credential rows found. Expect columns like email, password, smtp host, imap host.", 400);
  if (input.rows.length > 25) throw new OpError("Import at most 25 inboxes at a time.", 400);
  let order: MailboxOrder | null = null;
  if (input.orderId) {
    order = await prisma.mailboxOrder.findUnique({ where: { id: input.orderId } });
    if (!order || order.userId !== userId) throw new OpError("Order not found", 404);
  }
  const imported: MailboxView[] = [];
  const failed: { address: string; error: string }[] = [];
  for (const r of input.rows) {
    try {
      imported.push(
        await importSmtpMailbox(userId, {
          ...r,
          providerHint: input.providerHint ?? null,
          orderId: order?.id ?? null,
          skipVerify: input.skipVerify,
        }),
      );
    } catch (e) {
      failed.push({ address: r.address, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (order && imported.length) {
    const total = await prisma.mailbox.count({ where: { orderId: order.id } });
    order = await prisma.mailboxOrder.update({
      where: { id: order.id },
      data: total >= order.quantity ? { status: "FULFILLED", fulfilledAt: new Date(), note: null } : { note: `${total}/${order.quantity} inboxes imported.` },
    });
  }
  return { imported, failed, order: order ? toOrderView(order) : null };
}
