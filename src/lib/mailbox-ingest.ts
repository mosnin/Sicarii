// Turn a Composio trigger event into CRM truth.
//
// This module closes a live bug. Until now Scalar had NO reply ingestion: a
// contact only moved to REPLIED when an agent manually logged an inbound
// message, so `list_due_followups` cheerfully told the agent to chase somebody
// who replied four days ago. It also meant the best enrichment source we have,
// the operator's own threads, signatures and meetings, went unused while we
// paid vendors for weaker data about the same people.
//
// Three rules run through everything below:
//
//   FORWARD-ONLY. Nothing dated before MailboxSync.syncFromAt is imported,
//   ever. The cutoff is stamped at connect time (see connections.ts).
//
//   NEVER ATTACH TO THE WRONG RECORD. Contact matching is exact-email only.
//   No name matching, no fuzzy domain matching, no "probably the same Dave".
//   A null link is always better than a wrong one (AGENTS.md).
//
//   AN AUTORESPONDER IS NOT A REPLY. Counting an out-of-office as a reply
//   advances the contact AND credits the outreach bandit, which silently
//   corrupts every variant's reply rate. We would rather miss a real reply's
//   attribution than score a vacation responder as a win.

import { Prisma, type AgentTask } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { attributeReply } from "@/lib/variant-operations";
import {
  executeAllowedTool,
  getAllowedToolSchema,
  isComposioConfigured,
  providerForTriggerSlug,
  type ComposioProvider,
} from "@/lib/composio";
import type { TaskHandlerResult, TaskRunContext } from "@/lib/dispatch";

/* ---------------------------- Task contract ---------------------------- */

/** AgentTask.kind written by the Composio webhook for a Gmail event. */
export const MAILBOX_INGEST_KIND = "mailbox_ingest";
/** AgentTask.kind written by the Composio webhook for a Calendar event. */
export const CALENDAR_INGEST_KIND = "calendar_ingest";

/** The payload the webhook writes onto the AgentTask row. Every `data` field
 *  is treated as nullable, because on Composio's side every one of them is. */
export interface IngestTaskPayload {
  source: "composio";
  /** The `webhook-id` header, stable across retries. Kept for tracing. */
  webhookId: string;
  triggerSlug: string;
  toolkitSlug: string | null;
  provider: ComposioProvider;
  /** Our ConnectedAccount.id (NOT Composio's ca_*). */
  connectionId: string;
  composioConnectionId: string | null;
  /** When the webhook arrived. Never used for ordering: see sortKey below. */
  receivedAt: string;
  data: Record<string, unknown>;
}

/* ------------------------------ Utilities ------------------------------ */

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** First non-null value among a list of candidate keys, searched shallowly
 *  then one level into `payload`/`message`/`data`. Composio's per-tool
 *  argument and payload key names were NOT verifiable offline, so every read
 *  goes through an alias list rather than a hardcoded field name. */
function pick(source: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!source) return null;
  for (const key of keys) {
    if (source[key] != null) return source[key];
  }
  for (const nestKey of ["payload", "message", "data", "event"]) {
    const nested = obj(source[nestKey]);
    if (!nested) continue;
    for (const key of keys) {
      if (nested[key] != null) return nested[key];
    }
  }
  return null;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Pull a bare address out of "Display Name <a@b.com>" and lowercase it.
 *  Returns null rather than guessing when there is no address at all. */
export function parseEmailAddress(raw: unknown): string | null {
  const text = str(raw);
  if (!text) return null;
  const angled = text.match(/<([^>]+)>/);
  const candidate = angled ? angled[1] : text;
  const match = candidate.match(EMAIL_RE);
  return match ? match[0].toLowerCase() : null;
}

/** The display name in "Display Name <a@b.com>", or null. */
export function parseDisplayName(raw: unknown): string | null {
  const text = str(raw);
  if (!text || !text.includes("<")) return null;
  const name = text.slice(0, text.indexOf("<")).trim().replace(/^["']|["']$/g, "");
  return name && !name.includes("@") ? name : null;
}

/** Every address in a value that may be a string, a comma list, or an array. */
export function parseEmailList(raw: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const text = str(v);
    if (!text) return;
    for (const part of text.split(/[,;]/)) {
      const email = parseEmailAddress(part);
      if (email) out.push(email);
    }
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else push(raw);
  return [...new Set(out)];
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).toLowerCase() : null;
}

/** Coerce Gmail's several date shapes: RFC-2822 header, ISO string, or epoch
 *  millis as a numeric string (internalDate). Returns null on anything else,
 *  because a message with no honest timestamp cannot be placed against the
 *  forward-only cutoff and must not be imported. */
export function parseTimestamp(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const text = str(raw);
  if (!text) return null;
  if (/^\d{10}$/.test(text)) return new Date(Number(text) * 1000);
  if (/^\d{13}$/.test(text)) return new Date(Number(text));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* -------------------------- Address classifiers ------------------------ */

// Local parts that are unambiguously a machine. Kept SHORT on purpose: this
// list also gates reply attribution, and a false positive here means a real
// human's reply is never credited. "support", "info", "hello" and "team" are
// deliberately absent, since those are staffed inboxes at plenty of companies.
const MACHINE_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "mailer-daemon",
  "mailerdaemon",
  "postmaster",
  "bounce",
  "bounces",
  "bounced",
  "daemon",
  "cron",
  "root",
  "automailer",
  "autoresponder",
  "auto-reply",
  "autoreply",
]);

// Broader: still automated, but plausibly worth reading. These block
// AUTO-CREATION of a contact (a notification address is never a person) while
// leaving the message itself stored and readable.
const AUTOMATED_LOCAL_PARTS = new Set([
  "notification",
  "notifications",
  "notify",
  "alert",
  "alerts",
  "updates",
  "newsletter",
  "newsletters",
  "digest",
  "mailer",
  "mail",
  "system",
  "admin@localhost",
  "receipts",
  "billing-noreply",
  "invite",
  "invites",
  "calendar-notification",
]);

/** A machine that cannot hold a conversation. Blocks auto-creation AND reply
 *  attribution: a bounce is not a reply, however inbound it looks. */
export function isMachineAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const address = email.toLowerCase();
  const local = address.split("@")[0] ?? "";
  const base = local.split("+")[0];
  if (MACHINE_LOCAL_PARTS.has(base)) return true;
  if (/^(no.?reply|do.?not.?reply|bounce|mailer.?daemon|postmaster)/.test(base)) return true;
  const domain = emailDomain(address) ?? "";
  return /^(bounces?|mailer|reply)\./.test(domain);
}

/** Automated but not necessarily a daemon. Blocks auto-creation only. */
export function isAutomatedAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  if (isMachineAddress(email)) return true;
  const local = (email.toLowerCase().split("@")[0] ?? "").split("+")[0];
  if (AUTOMATED_LOCAL_PARTS.has(local)) return true;
  // Long random local parts are almost always per-recipient tracking handles
  // (`u=3f9a...@mailer.example.com`), never a person to file in the CRM.
  return /^[a-f0-9]{20,}$/.test(local);
}

/* --------------------------- Autoresponders ---------------------------- */

// THE HEURISTIC, AND WHAT IT CANNOT DO.
//
// Headers first, because they are the only part of this that is actually
// specified: RFC 3834 says an automatic response MUST carry
// `Auto-Submitted:` with a value other than `no`, and the de-facto Microsoft
// and Lotus headers (`X-Auto-Response-Suppress`, `X-Autoreply`,
// `X-Autorespond`, `Precedence: auto_reply`) are widely emitted. When we can
// see headers, this is close to exact.
//
// Gmail trigger payloads do not reliably include headers, so there is a
// subject and body fallback, which is honest pattern matching and nothing
// more. It catches the common English (and a few common non-English) phrasings
// of "I am out of the office". It will MISS: an autoresponder written in a
// language we do not list, one with a creative subject line, and one whose
// body opens with small talk. It will occasionally FALSE-POSITIVE on a genuine
// human reply that opens "Thanks for your note, I am travelling this week".
//
// The bias is deliberate and asymmetric. A false positive costs one
// unattributed reply, recoverable and invisible to the bandit's correctness. A
// false negative permanently inflates a variant's reply rate with a vacation
// responder, and the bandit then routes real outreach toward a variant that
// never actually worked. So when the signal is ambiguous we withhold
// attribution, and in every case we still STORE the message: nothing is lost
// from the thread the operator reads, only the scoring is withheld.

const AUTORESPONDER_SUBJECT_RE = new RegExp(
  [
    String.raw`auto(matic)?[\s-]*(reply|response|antwort)`,
    String.raw`out\s+of\s+(the\s+)?office`,
    String.raw`\booo\b`,
    String.raw`away\s+from\s+(my|the)\s+(desk|office|email)`,
    String.raw`on\s+(annual\s+|parental\s+|maternity\s+|paternity\s+)?leave`,
    String.raw`on\s+vacation`,
    String.raw`abwesenheits?notiz`,
    String.raw`r[ée]ponse\s+automatique`,
    String.raw`absence\s+du\s+bureau`,
    String.raw`respuesta\s+autom[áa]tica`,
    String.raw`undeliverable`,
    String.raw`delivery\s+(status\s+notification|has\s+failed)`,
    String.raw`returned\s+mail`,
    String.raw`mail\s+delivery\s+(failed|subsystem)`,
  ].join("|"),
  "i",
);

const AUTORESPONDER_BODY_RE = new RegExp(
  [
    String.raw`i\s+am\s+(currently\s+)?(out\s+of\s+(the\s+)?office|away|on\s+(annual\s+)?leave|on\s+vacation)`,
    String.raw`i'?m\s+(currently\s+)?(out\s+of\s+(the\s+)?office|away|on\s+leave|on\s+vacation)`,
    String.raw`(will|shall)\s+be\s+(back|returning)\s+(in|on|to)\s+`,
    String.raw`(limited|no)\s+access\s+to\s+(my\s+)?e-?mail`,
    String.raw`thank\s+you\s+for\s+your\s+(e-?mail|message)[.,!\s]+i\s+am\s+(currently\s+)?(out|away)`,
    String.raw`this\s+is\s+an\s+automated\s+(reply|response|message)`,
    String.raw`please\s+do\s+not\s+reply\s+to\s+this\s+(e-?mail|message)`,
    String.raw`no\s+longer\s+(works?|with)\s+`,
    String.raw`has\s+left\s+the\s+company`,
  ].join("|"),
  "i",
);

export interface AutoresponderInput {
  subject?: string | null;
  body?: string | null;
  /** Header name (lowercased) to value. Absent for most Gmail trigger
   *  payloads, which is why the text fallback exists. */
  headers?: Record<string, string> | null;
  fromEmail?: string | null;
}

export interface AutoresponderVerdict {
  isAutoresponder: boolean;
  /** Why, in words. Written onto the stored message's activity trail so a
   *  human can audit a withheld attribution instead of guessing. */
  reason: string | null;
  /** "header" is near-certain; "text" is a heuristic guess. */
  confidence: "header" | "text" | null;
}

export function detectAutoresponder(input: AutoresponderInput): AutoresponderVerdict {
  const headers = input.headers ?? {};
  const get = (name: string) => (headers[name.toLowerCase()] ?? "").trim().toLowerCase();

  const autoSubmitted = get("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") {
    return { isAutoresponder: true, reason: `Auto-Submitted: ${autoSubmitted}`, confidence: "header" };
  }
  if (get("x-autoreply") || get("x-autorespond") || get("x-autoreply-from")) {
    return { isAutoresponder: true, reason: "X-Autoreply header present", confidence: "header" };
  }
  const precedence = get("precedence");
  if (["auto_reply", "bulk", "junk", "list"].includes(precedence)) {
    return { isAutoresponder: true, reason: `Precedence: ${precedence}`, confidence: "header" };
  }
  if (get("x-auto-response-suppress")) {
    return { isAutoresponder: true, reason: "X-Auto-Response-Suppress header present", confidence: "header" };
  }
  // An empty envelope sender is the RFC 5321 marker for a bounce or automated
  // notification; a human's mail never carries it.
  if (get("return-path") === "<>") {
    return { isAutoresponder: true, reason: "Empty Return-Path (bounce)", confidence: "header" };
  }

  const subject = input.subject ?? "";
  if (subject && AUTORESPONDER_SUBJECT_RE.test(subject)) {
    return { isAutoresponder: true, reason: `Subject reads as an autoresponder: "${subject.slice(0, 120)}"`, confidence: "text" };
  }

  // Only the opening of the body. An autoresponder says what it is up front;
  // scanning further down would trip on a quoted signature or a forwarded
  // out-of-office inside an otherwise genuine reply.
  const opening = (input.body ?? "").slice(0, 600);
  if (opening && AUTORESPONDER_BODY_RE.test(opening)) {
    return { isAutoresponder: true, reason: "Opening of the message reads as an autoresponder", confidence: "text" };
  }

  return { isAutoresponder: false, reason: null, confidence: null };
}

/* -------------------------- Signature blocks --------------------------- */

// Why bother: a signature is the single best evidence source for a job title,
// because people update their signature the week they are promoted, months
// before any data vendor notices. It feeds the evidence ledger, so it must be
// conservative. A wrong title on a record is worse than no title at all
// (AGENTS.md), which is why this returns null far more often than it returns a
// guess.

const SIG_DELIMITER_RE = /^\s*--\s*$/;
const QUOTE_START_RE =
  /^\s*(>|On .{6,160}\bwrote:|-{2,}\s*(Original Message|Forwarded message)|From:\s|Sent from Mail for)/i;
const MOBILE_FOOTER_RE = /^\s*(sent from my \w+|get outlook for \w+|sent via \w+)\s*$/i;

const TITLE_WORDS_RE =
  /\b(ceo|cto|coo|cfo|cmo|cio|chief\b|founder|co-?founder|owner|president|vice president|vp\b|svp|evp|head of|director|managing director|partner|principal|manager|engineer|developer|designer|architect|analyst|consultant|advisor|specialist|lead\b|associate|account executive|sdr|bdr|recruiter|controller|counsel)/i;
const COMPANY_SUFFIX_RE = /\b(inc|inc\.|llc|ltd|ltd\.|limited|gmbh|pty|corp|corp\.|co\.|plc|b\.?v\.?|a\/s|ab|oy|s\.?a\.?|s\.?r\.?l\.?)\b/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|io|co|net|org|ai|dev|app|xyz)\b)/i;

/**
 * Extract the trailing signature block from a message body, or null.
 *
 * Two paths, and only two:
 *   1. An RFC 3676 `-- ` delimiter line. Unambiguous; take what follows.
 *   2. The last few short lines, accepted ONLY when at least two independent
 *      signature signals are present (a phone number, a URL, an email, a job
 *      title, a company suffix).
 *
 * Anything else returns null. A paragraph of prose that happens to sit at the
 * bottom of an email is not a signature, and treating it as one would poison
 * the evidence ledger with sentences.
 */
export function extractSignatureBlock(body: string | null | undefined): string | null {
  if (!body) return null;

  // Cut the quoted chain first; a reply's signature is above the quote, and
  // the quote contains the OTHER person's signature, which is exactly the
  // wrong one to attach to this message.
  const lines: string[] = [];
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    if (QUOTE_START_RE.test(raw)) break;
    lines.push(raw);
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length === 0) return null;

  const delimiterAt = lines.findIndex((l) => SIG_DELIMITER_RE.test(l));
  let candidate: string[];
  if (delimiterAt >= 0 && delimiterAt < lines.length - 1) {
    candidate = lines.slice(delimiterAt + 1, delimiterAt + 9);
  } else {
    candidate = lines.slice(-6);
  }

  candidate = candidate
    .map((l) => l.trimEnd())
    .filter((l) => !MOBILE_FOOTER_RE.test(l));
  while (candidate.length && !candidate[0].trim()) candidate.shift();
  while (candidate.length && !candidate[candidate.length - 1].trim()) candidate.pop();
  if (candidate.length === 0) return null;

  // A signature is a stack of short lines. One long line means prose.
  if (candidate.some((l) => l.trim().length > 90)) {
    if (delimiterAt < 0) return null;
    candidate = candidate.filter((l) => l.trim().length <= 90);
    if (candidate.length === 0) return null;
  }

  if (delimiterAt >= 0) return candidate.join("\n").trim().slice(0, 1000) || null;

  const text = candidate.join("\n");
  let signals = 0;
  if (PHONE_RE.test(text)) signals++;
  if (URL_RE.test(text)) signals++;
  if (EMAIL_RE.test(text)) signals++;
  if (TITLE_WORDS_RE.test(text)) signals++;
  if (COMPANY_SUFFIX_RE.test(text)) signals++;
  if (signals < 2) return null;

  // A single line carrying two signals is a footer, not a signature block.
  if (candidate.filter((l) => l.trim()).length < 2) return null;

  return text.trim().slice(0, 1000) || null;
}

/* --------------------------- Gmail normalizer -------------------------- */

export interface NormalizedMessage {
  providerMessageId: string;
  providerThreadId: string;
  subject: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  bodyText: string | null;
  snippet: string | null;
  sentAt: Date;
  headers: Record<string, string>;
  labelIds: string[];
}

/** Header arrays come as [{name, value}] or as a flat object depending on the
 *  tool. Both are normalised to lowercase-keyed strings. */
function normalizeHeaders(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const e = obj(entry);
      const name = str(e?.name ?? e?.key);
      const value = str(e?.value);
      if (name && value) out[name.toLowerCase()] = value;
    }
    return out;
  }
  const flat = obj(raw);
  if (flat) {
    for (const [k, v] of Object.entries(flat)) {
      const value = str(v);
      if (value) out[k.toLowerCase()] = value;
    }
  }
  return out;
}

/**
 * Normalise one Gmail message from a trigger payload or a fetch tool result.
 *
 * ARGUMENT AND FIELD NAMES ARE NOT PINNED. Composio's Gmail payload keys could
 * not be verified offline, so every field is read through an alias list and
 * falls back to the RFC headers when the convenience key is absent. Returns
 * null when the message lacks an id, a thread id, a sender or a timestamp: a
 * message we cannot place in a thread, attribute to a sender, or date against
 * the forward-only cutoff is not a message we can safely store.
 */
export function normalizeGmailMessage(raw: unknown): NormalizedMessage | null {
  const data = obj(raw);
  if (!data) return null;

  const headers = normalizeHeaders(
    pick(data, "headers", "message_headers", "messageHeaders") ?? obj(data.payload)?.headers,
  );

  const providerMessageId = str(pick(data, "message_id", "messageId", "id", "gmail_message_id"));
  const providerThreadId =
    str(pick(data, "thread_id", "threadId", "gmail_thread_id", "conversation_id")) ?? providerMessageId;
  if (!providerMessageId || !providerThreadId) return null;

  const fromEmail =
    parseEmailAddress(pick(data, "sender", "from", "from_email", "fromEmail")) ??
    parseEmailAddress(headers["from"]);
  if (!fromEmail) return null;

  const sentAt =
    parseTimestamp(pick(data, "message_timestamp", "messageTimestamp", "internalDate", "internal_date", "date", "sent_at")) ??
    parseTimestamp(headers["date"]);
  if (!sentAt) return null;

  const subject = str(pick(data, "subject")) ?? str(headers["subject"]);
  const bodyText =
    str(pick(data, "message_text", "messageText", "body_text", "bodyText", "text", "body", "plain_text")) ?? null;
  const snippet = str(pick(data, "snippet", "preview_text", "summary"));

  return {
    providerMessageId,
    providerThreadId,
    subject,
    fromEmail,
    fromName:
      parseDisplayName(pick(data, "sender", "from", "from_email")) ??
      parseDisplayName(headers["from"]) ??
      str(pick(data, "sender_name", "from_name")),
    toEmails: parseEmailList(pick(data, "to", "to_email", "recipient", "recipients") ?? headers["to"]),
    ccEmails: parseEmailList(pick(data, "cc", "cc_email", "carbon_copy") ?? headers["cc"]),
    bodyText,
    snippet: snippet ?? (bodyText ? bodyText.slice(0, 300) : null),
    sentAt,
    headers,
    labelIds: arr(pick(data, "label_ids", "labelIds", "labels")).map((l) => String(l).toUpperCase()),
  };
}

/** A trigger event carries one message; a hydration call carries many. Accept
 *  either without the caller having to know which. */
export function extractGmailMessages(data: Record<string, unknown>): NormalizedMessage[] {
  const listKeys = ["messages", "message_list", "emails", "results", "items"];
  for (const key of listKeys) {
    const list = arr(data[key]);
    if (list.length) {
      return list
        .map((m) => normalizeGmailMessage(m))
        .filter((m): m is NormalizedMessage => m !== null);
    }
  }
  const single = normalizeGmailMessage(data);
  return single ? [single] : [];
}

/* -------------------------- Calendar normalizer ------------------------ */

export interface NormalizedAttendee {
  email: string;
  name: string | null;
  responseStatus: string | null;
  isOrganizer: boolean;
}

export interface NormalizedEvent {
  providerEventId: string;
  iCalUid: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  conferenceUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
  status: string | null;
  organizerEmail: string | null;
  attendees: NormalizedAttendee[];
}

function parseEventTime(raw: unknown): { at: Date | null; allDay: boolean } {
  const node = obj(raw);
  if (node) {
    const dateTime = parseTimestamp(node.dateTime ?? node.date_time ?? node.datetime);
    if (dateTime) return { at: dateTime, allDay: false };
    const date = parseTimestamp(node.date);
    if (date) return { at: date, allDay: true };
    return { at: null, allDay: false };
  }
  return { at: parseTimestamp(raw), allDay: false };
}

function conferenceUrlFrom(data: Record<string, unknown>): string | null {
  const direct = str(pick(data, "hangoutLink", "hangout_link", "conference_url", "conferenceUrl", "meet_link"));
  if (direct) return direct;
  const conference = obj(pick(data, "conferenceData", "conference_data"));
  for (const entry of arr(conference?.entryPoints ?? conference?.entry_points)) {
    const uri = str(obj(entry)?.uri);
    if (uri) return uri;
  }
  return null;
}

/** Normalise one calendar event. Same defensive-alias approach as Gmail: the
 *  sync trigger returns full Google event objects, but the exact wrapper keys
 *  were not verifiable offline. */
export function normalizeCalendarEvent(raw: unknown): NormalizedEvent | null {
  const data = obj(raw);
  if (!data) return null;

  const providerEventId = str(pick(data, "id", "event_id", "eventId", "google_event_id"));
  if (!providerEventId) return null;

  const start = parseEventTime(pick(data, "start", "start_time", "startTime", "starts_at"));
  if (!start.at) return null;
  const end = parseEventTime(pick(data, "end", "end_time", "endTime", "ends_at"));

  const attendees: NormalizedAttendee[] = [];
  for (const entry of arr(pick(data, "attendees", "attendee_list", "participants"))) {
    const node = obj(entry);
    const email = parseEmailAddress(node?.email ?? node?.emailAddress ?? entry);
    if (!email || attendees.some((a) => a.email === email)) continue;
    attendees.push({
      email,
      name: str(node?.displayName ?? node?.display_name ?? node?.name),
      responseStatus: str(node?.responseStatus ?? node?.response_status),
      isOrganizer: node?.organizer === true,
    });
  }

  return {
    providerEventId,
    iCalUid: str(pick(data, "iCalUID", "ical_uid", "icalUid")),
    title: str(pick(data, "summary", "title", "subject")),
    description: str(pick(data, "description")),
    location: str(pick(data, "location")),
    conferenceUrl: conferenceUrlFrom(data),
    startsAt: start.at,
    endsAt: end.at ?? new Date(start.at.getTime() + 30 * 60_000),
    isAllDay: start.allDay,
    status: str(pick(data, "status")),
    organizerEmail:
      parseEmailAddress(obj(pick(data, "organizer"))?.email) ??
      parseEmailAddress(pick(data, "organizer_email", "organizerEmail")),
    attendees,
  };
}

export function extractCalendarEvents(data: Record<string, unknown>): NormalizedEvent[] {
  for (const key of ["events", "items", "event_list", "results"]) {
    const list = arr(data[key]);
    if (list.length) {
      return list.map((e) => normalizeCalendarEvent(e)).filter((e): e is NormalizedEvent => e !== null);
    }
  }
  const single = normalizeCalendarEvent(obj(data.event) ?? data);
  return single ? [single] : [];
}

/* ------------------------------ Tenant ctx ----------------------------- */

interface SyncContext {
  userId: string;
  connectionId: string;
  provider: ComposioProvider;
  composioConnectionId: string | null;
  syncFromAt: Date;
  autoCreateContacts: boolean;
  /** Addresses that are US, never a contact and never an inbound reply. */
  ownEmails: Set<string>;
}

async function loadSyncContext(userId: string, connectionId: string): Promise<SyncContext> {
  const connection = await prisma.connectedAccount.findUnique({
    where: { id: connectionId },
    include: { sync: true },
  });
  if (!connection || connection.userId !== userId) {
    throw new OpError("Connection not found for this account", 404);
  }
  if (!connection.sync) {
    throw new OpError("This connection has no sync window; reconnect it.", 409);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

  const ownEmails = new Set<string>();
  const accountEmail = connection.accountEmail?.toLowerCase();
  if (accountEmail) ownEmails.add(accountEmail);
  if (user?.email) ownEmails.add(user.email.toLowerCase());
  // Team workspaces: every member's address is also "us".
  const members = await prisma.teamMember.findMany({
    where: { workspaceId: userId },
    select: { member: { select: { email: true } } },
  });
  for (const m of members) {
    if (m.member?.email) ownEmails.add(m.member.email.toLowerCase());
  }

  return {
    userId,
    connectionId,
    provider: connection.provider as ComposioProvider,
    composioConnectionId: connection.composioConnectionId,
    syncFromAt: connection.sync.syncFromAt,
    autoCreateContacts: connection.sync.autoCreateContacts,
    ownEmails,
  };
}

/* --------------------------- Contact linking --------------------------- */

/** Exact-email match, scoped to the tenant. No name matching, ever: too many
 *  same-name people, and a mis-linked thread is unrecoverable trust damage. */
async function findContactByEmail(userId: string, email: string) {
  return prisma.contact.findFirst({
    where: { userId, email: { equals: email, mode: "insensitive" } },
    select: { id: true, status: true, name: true, email: true },
  });
}

async function isSuppressedInbound(userId: string, email: string): Promise<boolean> {
  const domain = emailDomain(email);
  const scopes = ["INBOUND", "ALL"] as const;
  const [contact, suppressedDomain] = await Promise.all([
    prisma.suppressedContact.findFirst({
      where: { userId, email: { equals: email, mode: "insensitive" }, scope: { in: [...scopes] } },
      select: { id: true },
    }),
    domain
      ? prisma.suppressedDomain.findFirst({
          where: { userId, domain: { equals: domain, mode: "insensitive" }, scope: { in: [...scopes] } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  return Boolean(contact || suppressedDomain);
}

interface ResolvedContact {
  id: string;
  status: string;
  created: boolean;
}

/**
 * Find the contact for an address, or create one when the operator has opted
 * in. Every gate below is a reason NOT to create, and they are checked in
 * cheapest-first order:
 *
 *   our own address  -> we are not a lead
 *   machine/automated -> noreply@ is not a person
 *   autoCreateContacts off -> the operator has not asked for this
 *   suppression list -> the operator has explicitly said no to this address
 */
async function resolveContact(
  ctx: SyncContext,
  email: string,
  name: string | null,
  source: string,
): Promise<ResolvedContact | null> {
  if (!email || ctx.ownEmails.has(email)) return null;

  const existing = await findContactByEmail(ctx.userId, email);
  if (existing) return { id: existing.id, status: existing.status, created: false };

  if (!ctx.autoCreateContacts) return null;
  if (isAutomatedAddress(email)) return null;
  if (await isSuppressedInbound(ctx.userId, email)) return null;

  const created = await prisma.contact.create({
    data: {
      userId: ctx.userId,
      email,
      name: name ?? null,
      status: "NEW",
      source,
    },
    select: { id: true, status: true },
  });
  return { id: created.id, status: created.status, created: true };
}

/* ---------------------------- Mail ingestion --------------------------- */

export interface MailIngestResult {
  stored: number;
  skippedBeforeCutoff: number;
  duplicates: number;
  contactsCreated: number;
  repliesDetected: number;
  autorespondersIgnored: number;
  threadIds: string[];
}

/**
 * Persist a batch of Gmail messages and apply their CRM consequences.
 *
 * Messages are sorted by their own timestamp before anything is written.
 * Composio's delivery ordering is undocumented and retries make it worse, so
 * arrival order is meaningless: sorting here, plus recomputing thread
 * aggregates from the stored rows afterwards, means a late-arriving older
 * message can never rewrite `lastMessageAt` backwards or make a stale message
 * look like the newest reply.
 */
export async function ingestMailMessages(
  userId: string,
  connectionId: string,
  messages: NormalizedMessage[],
): Promise<MailIngestResult> {
  const ctx = await loadSyncContext(userId, connectionId);
  const result: MailIngestResult = {
    stored: 0,
    skippedBeforeCutoff: 0,
    duplicates: 0,
    contactsCreated: 0,
    repliesDetected: 0,
    autorespondersIgnored: 0,
    threadIds: [],
  };

  const ordered = [...messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const touchedThreads = new Set<string>();

  for (const message of ordered) {
    // FORWARD-ONLY. The one line that stops a ten-year archive landing in the
    // CRM. Checked per message, not per batch, so a hydration that returns
    // older siblings drops them too.
    if (message.sentAt < ctx.syncFromAt) {
      result.skippedBeforeCutoff++;
      continue;
    }

    const already = await prisma.emailMessage.findUnique({
      where: { userId_providerMessageId: { userId, providerMessageId: message.providerMessageId } },
      select: { id: true, threadId: true },
    });
    if (already) {
      result.duplicates++;
      touchedThreads.add(already.threadId);
      continue;
    }

    const direction = directionOf(message, ctx);
    const counterparty =
      direction === "INBOUND"
        ? message.fromEmail
        : message.toEmails.find((e) => !ctx.ownEmails.has(e)) ?? null;

    let contact: ResolvedContact | null = null;
    if (counterparty) {
      contact = await resolveContact(
        ctx,
        counterparty,
        direction === "INBOUND" ? message.fromName : null,
        "mailbox-sync",
      );
      if (contact?.created) result.contactsCreated++;
    }

    const thread = await upsertThread(ctx, message, contact?.id ?? null);
    touchedThreads.add(thread.id);

    const signatureBlock =
      direction === "INBOUND" ? extractSignatureBlock(message.bodyText) : null;

    await prisma.emailMessage.create({
      data: {
        userId,
        threadId: thread.id,
        providerMessageId: message.providerMessageId,
        direction,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        toEmails: message.toEmails,
        ccEmails: message.ccEmails,
        subject: message.subject,
        snippet: message.snippet?.slice(0, 2000) ?? null,
        bodyText: message.bodyText,
        signatureBlock,
        sentAt: message.sentAt,
        contactId: contact?.id ?? thread.contactId ?? null,
      },
    });
    result.stored++;

    if (direction === "INBOUND") {
      const outcome = await applyInboundReply(ctx, message, contact?.id ?? thread.contactId ?? null);
      if (outcome === "replied") result.repliesDetected++;
      if (outcome === "autoresponder") result.autorespondersIgnored++;
    }
  }

  for (const threadId of touchedThreads) await refreshThreadAggregates(threadId);
  result.threadIds = [...touchedThreads];

  await prisma.mailboxSync.updateMany({
    where: { connectedAccountId: connectionId, userId },
    data: { lastSyncedAt: new Date(), status: "IDLE", lastError: null },
  });

  return result;
}

/** Outbound when we sent it: Gmail's SENT label, or the sender being one of
 *  our own addresses. Both checks, because the label is absent on some payload
 *  shapes and the account email is absent on others. */
function directionOf(message: NormalizedMessage, ctx: SyncContext): "INBOUND" | "OUTBOUND" {
  if (ctx.ownEmails.has(message.fromEmail)) return "OUTBOUND";
  if (message.labelIds.includes("SENT") && !message.labelIds.includes("INBOX")) return "OUTBOUND";
  return "INBOUND";
}

async function upsertThread(
  ctx: SyncContext,
  message: NormalizedMessage,
  contactId: string | null,
) {
  const existing = await prisma.emailThread.findUnique({
    where: {
      userId_providerThreadId: { userId: ctx.userId, providerThreadId: message.providerThreadId },
    },
  });
  if (existing) {
    // Only ever ADD a contact link, never move one: a thread that has already
    // been attributed to a person must not silently jump to somebody else
    // because a stranger was cc'd into it later.
    if (!existing.contactId && contactId) {
      return prisma.emailThread.update({ where: { id: existing.id }, data: { contactId } });
    }
    return existing;
  }
  return prisma.emailThread.create({
    data: {
      userId: ctx.userId,
      providerThreadId: message.providerThreadId,
      subject: message.subject,
      contactId,
    },
  });
}

/** Recompute participants and the message window from the stored rows, so
 *  out-of-order arrival is arithmetically irrelevant. */
async function refreshThreadAggregates(threadId: string): Promise<void> {
  const messages = await prisma.emailMessage.findMany({
    where: { threadId },
    select: { fromEmail: true, toEmails: true, ccEmails: true, sentAt: true, subject: true },
    orderBy: { sentAt: "asc" },
  });
  if (messages.length === 0) return;

  const participants = new Set<string>();
  for (const m of messages) {
    participants.add(m.fromEmail);
    for (const e of m.toEmails) participants.add(e);
    for (const e of m.ccEmails) participants.add(e);
  }

  await prisma.emailThread.update({
    where: { id: threadId },
    data: {
      participants: [...participants].slice(0, 100),
      firstMessageAt: messages[0].sentAt,
      lastMessageAt: messages[messages.length - 1].sentAt,
      messageCount: messages.length,
      subject: messages[0].subject ?? undefined,
    },
  });
}

/**
 * The reply path. This is the bug fix.
 *
 * An inbound message on a thread linked to a CONTACTED contact advances that
 * contact to REPLIED and credits the outreach bandit, so `list_due_followups`
 * stops chasing somebody who already answered and the bandit learns which
 * variant actually worked.
 *
 * Two things are refused: a machine address (a bounce is not a reply) and an
 * autoresponder (a vacation notice is not a reply). Today every inbound flips
 * the status and credits the bandit, so out-of-office responders are being
 * scored as wins and are actively corrupting variant reply rates.
 *
 * The status guard lives in the WHERE clause, so a redelivered webhook finds
 * the contact already REPLIED, updates nothing, and never double-credits.
 */
async function applyInboundReply(
  ctx: SyncContext,
  message: NormalizedMessage,
  contactId: string | null,
): Promise<"replied" | "autoresponder" | "none"> {
  if (!contactId) return "none";
  if (isMachineAddress(message.fromEmail)) return "autoresponder";

  const verdict = detectAutoresponder({
    subject: message.subject,
    body: message.bodyText,
    headers: message.headers,
    fromEmail: message.fromEmail,
  });
  if (verdict.isAutoresponder) {
    // Stored, visible, and explicitly NOT scored. The note is the audit trail
    // for a withheld attribution.
    await prisma.activity.create({
      data: {
        userId: ctx.userId,
        contactId,
        kind: "note",
        channel: "email",
        body: `Automatic reply received, not counted as a reply (${verdict.reason ?? "autoresponder"}).`,
      },
    });
    return "autoresponder";
  }

  const advanced = await prisma.contact.updateMany({
    where: { id: contactId, userId: ctx.userId, status: "CONTACTED" },
    data: { status: "REPLIED" },
  });
  if (advanced.count === 0) return "none";

  await prisma.activity.create({
    data: {
      userId: ctx.userId,
      contactId,
      kind: "reply",
      channel: "email",
      body: `Replied by email${message.subject ? `: ${message.subject}` : ""}`,
    },
  });

  // Attribution writes its own row atomically and must never fail the ingest
  // just because there is nothing to attribute (see variant-operations.ts).
  await attributeReply(contactId);
  return "replied";
}

/* -------------------------- Calendar ingestion ------------------------- */

export interface CalendarIngestResult {
  stored: number;
  skippedBeforeCutoff: number;
  contactsCreated: number;
  attendeesLinked: number;
}

export async function ingestCalendarEvents(
  userId: string,
  connectionId: string,
  events: NormalizedEvent[],
): Promise<CalendarIngestResult> {
  const ctx = await loadSyncContext(userId, connectionId);
  const result: CalendarIngestResult = {
    stored: 0,
    skippedBeforeCutoff: 0,
    contactsCreated: 0,
    attendeesLinked: 0,
  };

  const ordered = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (const event of ordered) {
    // Forward-only for meetings too: a calendar's back catalogue is not CRM
    // history the operator asked us for.
    if (event.startsAt < ctx.syncFromAt) {
      result.skippedBeforeCutoff++;
      continue;
    }

    // The first external attendee who resolves to a contact owns the event.
    // External is decided by address, never by name.
    let eventContactId: string | null = null;
    const resolved: { attendee: NormalizedAttendee; contactId: string | null }[] = [];
    for (const attendee of event.attendees) {
      if (ctx.ownEmails.has(attendee.email)) {
        resolved.push({ attendee, contactId: null });
        continue;
      }
      const contact = await resolveContact(ctx, attendee.email, attendee.name, "calendar-sync");
      if (contact?.created) result.contactsCreated++;
      if (contact) {
        result.attendeesLinked++;
        eventContactId = eventContactId ?? contact.id;
      }
      resolved.push({ attendee, contactId: contact?.id ?? null });
    }

    const saved = await prisma.calendarEvent.upsert({
      where: { userId_providerEventId: { userId, providerEventId: event.providerEventId } },
      update: {
        iCalUid: event.iCalUid,
        title: event.title,
        description: event.description,
        location: event.location,
        conferenceUrl: event.conferenceUrl,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        isAllDay: event.isAllDay,
        status: event.status,
        organizerEmail: event.organizerEmail,
        ...(eventContactId ? { contactId: eventContactId } : {}),
      },
      create: {
        userId,
        providerEventId: event.providerEventId,
        iCalUid: event.iCalUid,
        title: event.title,
        description: event.description,
        location: event.location,
        conferenceUrl: event.conferenceUrl,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        isAllDay: event.isAllDay,
        status: event.status,
        organizerEmail: event.organizerEmail,
        contactId: eventContactId,
      },
      select: { id: true },
    });
    result.stored++;

    for (const { attendee, contactId } of resolved) {
      await prisma.calendarAttendee.upsert({
        where: { eventId_email: { eventId: saved.id, email: attendee.email } },
        update: {
          name: attendee.name,
          responseStatus: attendee.responseStatus,
          isOrganizer: attendee.isOrganizer,
          ...(contactId ? { contactId } : {}),
        },
        create: {
          eventId: saved.id,
          email: attendee.email,
          name: attendee.name,
          responseStatus: attendee.responseStatus,
          isOrganizer: attendee.isOrganizer,
          contactId,
        },
      });
    }
  }

  await prisma.mailboxSync.updateMany({
    where: { connectedAccountId: connectionId, userId },
    data: { lastSyncedAt: new Date(), status: "IDLE", lastError: null },
  });

  return result;
}

/* ------------------------------ Hydration ------------------------------ */

/** The one Gmail tool this module executes. It is on the read-only allowlist
 *  in composio.ts, which is the compensating control for the wide Google
 *  scopes the founder chose: the grant carries delete authority, so execution
 *  is fenced to read-only slugs and this constant must stay one of them. */
const THREAD_FETCH_SLUG = "GMAIL_FETCH_MESSAGE_BY_THREAD_ID";

/**
 * Fetch the full messages of a thread when the trigger payload arrived without
 * a body.
 *
 * The argument names for GMAIL_FETCH_MESSAGE_BY_THREAD_ID could not be
 * verified offline, so rather than hardcode a guess this reads the tool's real
 * input schema at runtime and matches the thread-id parameter by shape. If the
 * schema cannot be read, or no parameter looks like a thread id, we return
 * nothing and keep the snippet we already have. A missing body is a smaller
 * problem than a call that fails on every message forever.
 */
export async function hydrateThread(
  ctx: { composioConnectionId: string | null; userId: string },
  threadId: string,
): Promise<NormalizedMessage[]> {
  if (!isComposioConfigured() || !ctx.composioConnectionId) return [];

  let properties: Record<string, unknown> = {};
  try {
    properties = await getAllowedToolSchema(THREAD_FETCH_SLUG);
  } catch (e) {
    console.error("[mailbox-ingest] could not read the thread-fetch tool schema", e);
    return [];
  }

  const names = Object.keys(properties);
  const threadArg = names.find((n) => /thread.?id/i.test(n));
  if (!threadArg) {
    console.error("[mailbox-ingest] no thread-id argument on", THREAD_FETCH_SLUG, names);
    return [];
  }
  const userArg = names.find((n) => /^user.?id$/i.test(n));

  try {
    const response = await executeAllowedTool(THREAD_FETCH_SLUG, {
      userId: ctx.userId,
      connectedAccountId: ctx.composioConnectionId,
      arguments: { [threadArg]: threadId, ...(userArg ? { [userArg]: "me" } : {}) },
    });
    if (!response?.successful || !response.data) return [];
    return extractGmailMessages(response.data);
  } catch (e) {
    console.error("[mailbox-ingest] thread hydration failed", e);
    return [];
  }
}

/* ---------------------------- Task handlers ---------------------------- */

function payloadOf(task: AgentTask): IngestTaskPayload {
  const payload = obj(task.payload);
  if (!payload || payload.source !== "composio") {
    throw new OpError("Task payload is not a Composio ingest payload", 400);
  }
  const connectionId = str(payload.connectionId);
  const data = obj(payload.data);
  if (!connectionId || !data) throw new OpError("Task payload is missing connectionId or data", 400);
  return {
    source: "composio",
    webhookId: str(payload.webhookId) ?? "",
    triggerSlug: str(payload.triggerSlug) ?? "",
    toolkitSlug: str(payload.toolkitSlug),
    provider: (providerForTriggerSlug(str(payload.triggerSlug)) ?? "GMAIL") as ComposioProvider,
    connectionId,
    composioConnectionId: str(payload.composioConnectionId),
    receivedAt: str(payload.receivedAt) ?? new Date().toISOString(),
    data,
  };
}

/**
 * Handler for AgentTask kind `mailbox_ingest`. Register with:
 *   registerTaskHandler(MAILBOX_INGEST_KIND, handleMailboxIngest)
 */
export async function handleMailboxIngest(
  task: AgentTask,
  _ctx: TaskRunContext,
): Promise<TaskHandlerResult> {
  void _ctx;
  const payload = payloadOf(task);
  let messages = extractGmailMessages(payload.data);

  // Only hydrate when the payload gave us a thread but no readable content;
  // hydration costs a Composio call against a shared, per-organisation rate
  // limit, so it is the exception, not the path.
  if (messages.length === 1 && !messages[0].bodyText && !messages[0].snippet) {
    const fetched = await hydrateThread(
      { composioConnectionId: payload.composioConnectionId, userId: task.userId },
      messages[0].providerThreadId,
    );
    if (fetched.length) messages = fetched;
  }

  if (messages.length === 0) {
    return { outcome: "no readable message in the payload, nothing stored" };
  }

  const result = await ingestMailMessages(task.userId, payload.connectionId, messages);
  const parts = [`${result.stored} stored`];
  if (result.duplicates) parts.push(`${result.duplicates} already seen`);
  if (result.skippedBeforeCutoff) parts.push(`${result.skippedBeforeCutoff} before the sync cutoff`);
  if (result.repliesDetected) parts.push(`${result.repliesDetected} reply detected`);
  if (result.autorespondersIgnored) parts.push(`${result.autorespondersIgnored} autoresponder ignored`);
  if (result.contactsCreated) parts.push(`${result.contactsCreated} contact created`);
  return { outcome: parts.join(", "), payload: result as unknown as Prisma.InputJsonValue };
}

/**
 * Handler for AgentTask kind `calendar_ingest`. Register with:
 *   registerTaskHandler(CALENDAR_INGEST_KIND, handleCalendarIngest)
 */
export async function handleCalendarIngest(
  task: AgentTask,
  _ctx: TaskRunContext,
): Promise<TaskHandlerResult> {
  void _ctx;
  const payload = payloadOf(task);
  const events = extractCalendarEvents(payload.data);
  if (events.length === 0) return { outcome: "no readable event in the payload, nothing stored" };

  const result = await ingestCalendarEvents(task.userId, payload.connectionId, events);
  const parts = [`${result.stored} meeting stored`];
  if (result.skippedBeforeCutoff) parts.push(`${result.skippedBeforeCutoff} before the sync cutoff`);
  if (result.attendeesLinked) parts.push(`${result.attendeesLinked} attendee linked`);
  if (result.contactsCreated) parts.push(`${result.contactsCreated} contact created`);
  return { outcome: parts.join(", "), payload: result as unknown as Prisma.InputJsonValue };
}

/* ------------------------------ CRM reads ------------------------------ */

const MAX_ROWS = 200;
function clamp(limit?: number, fallback = 25): number {
  if (limit == null || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_ROWS);
}

async function assertContactOwned(userId: string, contactId: string) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, userId: true, name: true, email: true, entityId: true },
  });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  return contact;
}

async function assertEntityOwned(userId: string, entityId: string) {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, userId: true, name: true },
  });
  if (!entity || entity.userId !== userId) throw new OpError("Company not found", 404);
  return entity;
}

/** Threads, newest activity first, optionally narrowed to one contact or
 *  company. */
export async function listThreads(
  userId: string,
  opts: { contactId?: string; entityId?: string; query?: string; limit?: number } = {},
) {
  if (opts.contactId) await assertContactOwned(userId, opts.contactId);
  if (opts.entityId) await assertEntityOwned(userId, opts.entityId);

  const threads = await prisma.emailThread.findMany({
    where: {
      userId,
      ...(opts.contactId ? { contactId: opts.contactId } : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
      ...(opts.query ? { subject: { contains: opts.query, mode: "insensitive" } } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: clamp(opts.limit),
    select: {
      id: true,
      subject: true,
      participants: true,
      messageCount: true,
      firstMessageAt: true,
      lastMessageAt: true,
      contactId: true,
      entityId: true,
      contact: { select: { id: true, name: true, email: true } },
    },
  });
  return { threads };
}

/** One thread with its full message history, oldest first. */
export async function getThread(userId: string, threadId: string) {
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId },
    include: {
      contact: { select: { id: true, name: true, email: true, status: true } },
      messages: {
        orderBy: { sentAt: "asc" },
        select: {
          id: true,
          direction: true,
          fromEmail: true,
          fromName: true,
          toEmails: true,
          ccEmails: true,
          subject: true,
          snippet: true,
          bodyText: true,
          signatureBlock: true,
          sentAt: true,
        },
      },
    },
  });
  if (!thread || thread.userId !== userId) throw new OpError("Thread not found", 404);
  return { thread };
}

/** Meetings, soonest first within the window. */
export async function listMeetings(
  userId: string,
  opts: { contactId?: string; entityId?: string; from?: Date; to?: Date; limit?: number } = {},
) {
  if (opts.contactId) await assertContactOwned(userId, opts.contactId);
  if (opts.entityId) await assertEntityOwned(userId, opts.entityId);

  const events = await prisma.calendarEvent.findMany({
    where: {
      userId,
      ...(opts.contactId
        ? { OR: [{ contactId: opts.contactId }, { attendees: { some: { contactId: opts.contactId } } }] }
        : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
      ...(opts.from || opts.to
        ? { startsAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    },
    orderBy: { startsAt: "desc" },
    take: clamp(opts.limit),
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      isAllDay: true,
      location: true,
      conferenceUrl: true,
      status: true,
      organizerEmail: true,
      contactId: true,
      attendees: {
        select: { email: true, name: true, responseStatus: true, isOrganizer: true, contactId: true },
      },
    },
  });
  return { meetings: events };
}

/**
 * Everything first-party we hold about one person or company: threads and
 * meetings in one view, newest first. This is the read an agent should make
 * FIRST, before paying any vendor.
 */
export async function readCrmHistory(
  userId: string,
  opts: { contactId?: string; entityId?: string; limit?: number },
) {
  if (!opts.contactId && !opts.entityId) {
    throw new OpError("Set exactly one of contactId or entityId", 400);
  }
  if (opts.contactId && opts.entityId) {
    throw new OpError("Set exactly one of contactId or entityId", 400);
  }

  const subject = opts.contactId
    ? await assertContactOwned(userId, opts.contactId)
    : await assertEntityOwned(userId, opts.entityId!);

  // For a company, sweep in every contact attached to it, so "what do we know
  // about Acme" is not silently limited to threads someone remembered to link.
  const contactIds = opts.contactId
    ? [opts.contactId]
    : (
        await prisma.contact.findMany({
          where: { userId, entityId: opts.entityId },
          select: { id: true },
        })
      ).map((c) => c.id);

  const limit = clamp(opts.limit, 20);
  const [threads, meetings, signatures] = await Promise.all([
    prisma.emailThread.findMany({
      where: {
        userId,
        OR: [
          ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
          ...(opts.entityId ? [{ entityId: opts.entityId }] : []),
        ],
      },
      orderBy: { lastMessageAt: "desc" },
      take: limit,
      select: {
        id: true,
        subject: true,
        participants: true,
        messageCount: true,
        firstMessageAt: true,
        lastMessageAt: true,
        contactId: true,
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        userId,
        OR: [
          ...(contactIds.length
            ? [{ contactId: { in: contactIds } }, { attendees: { some: { contactId: { in: contactIds } } } }]
            : []),
          ...(opts.entityId ? [{ entityId: opts.entityId }] : []),
        ],
      },
      orderBy: { startsAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        location: true,
        conferenceUrl: true,
        organizerEmail: true,
        attendees: { select: { email: true, name: true, responseStatus: true } },
      },
    }),
    // Signature blocks are the highest-value enrichment in here: people update
    // a signature the week they are promoted.
    contactIds.length
      ? prisma.emailMessage.findMany({
          where: { userId, contactId: { in: contactIds }, signatureBlock: { not: null } },
          orderBy: { sentAt: "desc" },
          take: 5,
          select: { sentAt: true, fromEmail: true, signatureBlock: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    subject: { type: opts.contactId ? "contact" : "entity", id: subject.id, name: subject.name },
    threads,
    meetings,
    recentSignatures: signatures,
    guidance:
      threads.length === 0 && meetings.length === 0
        ? "No first-party history yet. Either nothing has been exchanged, or no mailbox is connected (check connection_status)."
        : "This is first-party history from the operator's own mailbox and calendar. Trust it over any data vendor, and read the recent signature blocks before paying to enrich a job title.",
  };
}
