// AgentMail client. Two keys can be in play:
//   - the PLATFORM key (AGENTMAIL_API_KEY): Scalar's own organization, used to
//     provision inboxes that Scalar sells/creates for an account (Mailbox rows
//     with provider AGENTMAIL), register custom sending domains, and receive
//     inbound webhooks;
//   - the per-user key (User.agentMailApiKey): a bring-your-own account, used
//     by getThreadsForContact to surface that user's existing threads.
// Thin fetch layer over the REST API (no SDK, matching stripe.ts). Wire
// format is snake_case; field names below were verified against the
// agentmail@0.5.27 SDK's serialization layer (message_id, thread_id,
// in_reply_to, display_name, client_id, track_opens).
// Docs: https://docs.agentmail.to  Base: https://api.agentmail.to/v0

import { Webhook } from "svix";
import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://api.agentmail.to/v0";

export function isAgentMailConfigured(key?: string | null): boolean {
  return Boolean(key && key.trim());
}

/** Platform key: lets Scalar provision inboxes itself. */
export function platformAgentMailKey(): string | null {
  const k = process.env.AGENTMAIL_API_KEY?.trim();
  return k || null;
}

export function isAgentMailPlatformConfigured(): boolean {
  return platformAgentMailKey() !== null;
}

export class AgentMailError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AgentMailError";
    this.status = status;
  }
}

async function am<T>(
  key: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
      ...(extraHeaders ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new AgentMailError(`AgentMail ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function amGet<T>(key: string, path: string): Promise<T> {
  return am<T>(key, "GET", path);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/* ------------------------------ Inboxes ------------------------------ */

export interface AgentMailInbox {
  inboxId: string;
  email: string;
  displayName?: string;
}

function parseInbox(raw: Record<string, unknown>): AgentMailInbox {
  const inboxId = str(raw.inbox_id) ?? str(raw.email) ?? "";
  return { inboxId, email: str(raw.email) ?? inboxId, displayName: str(raw.display_name) };
}

/** Create an inbox. `domain` must already be a verified custom domain on the
 *  organization (or omitted for the default agentmail.to domain). clientId is
 *  an idempotency key: re-creating with the same one returns the same inbox. */
export async function createInbox(
  key: string,
  input: { username: string; domain?: string; displayName?: string; clientId?: string },
): Promise<AgentMailInbox> {
  const raw = await am<Record<string, unknown>>(key, "POST", "/inboxes", {
    username: input.username,
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.displayName ? { display_name: input.displayName } : {}),
    ...(input.clientId ? { client_id: input.clientId } : {}),
  });
  return parseInbox(raw);
}

export async function deleteInbox(key: string, inboxId: string): Promise<void> {
  await am(key, "DELETE", `/inboxes/${encodeURIComponent(inboxId)}`);
}

/* ------------------------------ Sending ------------------------------ */

export interface SendInput {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  labels?: string[];
}

export interface SendResult {
  messageId: string;
  threadId?: string;
}

export async function sendMessage(key: string, inboxId: string, input: SendInput): Promise<SendResult> {
  const raw = await am<Record<string, unknown>>(
    key,
    "POST",
    `/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
    {
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
      ...(input.labels ? { labels: input.labels } : {}),
      track_opens: false,
    },
  );
  return { messageId: str(raw.message_id) ?? "", threadId: str(raw.thread_id) };
}

/** Reply in-thread: AgentMail sets In-Reply-To / References itself. */
export async function replyToMessage(
  key: string,
  inboxId: string,
  messageId: string,
  input: { text: string; html?: string; headers?: Record<string, string>; labels?: string[] },
): Promise<SendResult> {
  const raw = await am<Record<string, unknown>>(
    key,
    "POST",
    `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/reply`,
    {
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
      ...(input.labels ? { labels: input.labels } : {}),
      track_opens: false,
    },
  );
  return { messageId: str(raw.message_id) ?? "", threadId: str(raw.thread_id) };
}

/* ------------------------------ Reading ------------------------------ */

export interface AgentMailMessage {
  inboxId: string;
  threadId: string;
  messageId: string;
  labels: string[];
  timestamp?: string;
  from: string;
  to: string[];
  subject?: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references: string[];
  headers: Record<string, string>;
  rfcMessageId?: string;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseMessage(raw: Record<string, unknown>): AgentMailMessage {
  const headersRaw = raw.headers;
  const headers: Record<string, string> = {};
  if (headersRaw && typeof headersRaw === "object") {
    for (const [k, v] of Object.entries(headersRaw as Record<string, unknown>)) {
      if (typeof v === "string") headers[k.toLowerCase()] = v;
      else if (Array.isArray(v)) headers[k.toLowerCase()] = v.filter((x) => typeof x === "string").join(", ");
    }
  }
  return {
    inboxId: str(raw.inbox_id) ?? "",
    threadId: str(raw.thread_id) ?? "",
    messageId: str(raw.message_id) ?? "",
    labels: strArr(raw.labels),
    timestamp: str(raw.timestamp) ?? str(raw.created_at),
    from: str(raw.from) ?? "",
    to: strArr(raw.to),
    subject: str(raw.subject),
    text: str(raw.text) ?? str(raw.extracted_text),
    html: str(raw.html),
    inReplyTo: str(raw.in_reply_to),
    references: strArr(raw.references),
    headers,
    rfcMessageId: headers["message-id"],
  };
}

/** Full messages received in an inbox after `after` (ISO), oldest first.
 *  Used as the polling fallback when no webhook is registered. */
export async function listReceivedMessages(
  key: string,
  inboxId: string,
  opts: { after?: string; limit?: number } = {},
): Promise<AgentMailMessage[]> {
  const params = new URLSearchParams();
  params.set("labels", "received");
  params.set("ascending", "true");
  params.set("limit", String(opts.limit ?? 50));
  if (opts.after) params.set("after", opts.after);
  const list = await amGet<{ messages?: unknown[] }>(
    key,
    `/inboxes/${encodeURIComponent(inboxId)}/messages?${params.toString()}`,
  );
  const items = (list.messages ?? []) as Record<string, unknown>[];
  // The list endpoint returns previews; fetch each message for its body and
  // headers (needed by the classifier and threading).
  const full: AgentMailMessage[] = [];
  for (const item of items) {
    const id = str(item.message_id);
    if (!id) continue;
    try {
      const raw = await amGet<Record<string, unknown>>(
        key,
        `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(id)}`,
      );
      full.push(parseMessage(raw));
    } catch {
      full.push(parseMessage(item));
    }
  }
  return full;
}

/* ------------------------------ Domains ------------------------------ */

export interface AgentMailDnsRecord {
  type: "TXT" | "CNAME" | "MX" | string;
  name: string;
  value: string;
  status: "MISSING" | "INVALID" | "VALID" | string;
  priority?: number;
}

export interface AgentMailDomain {
  domainId: string;
  domain: string;
  status: "NOT_STARTED" | "PENDING" | "INVALID" | "FAILED" | "VERIFYING" | "VERIFIED" | string;
  records: AgentMailDnsRecord[];
}

function parseDomain(raw: Record<string, unknown>): AgentMailDomain {
  const records = Array.isArray(raw.records)
    ? (raw.records as Record<string, unknown>[]).map((r) => ({
        type: str(r.type) ?? "TXT",
        name: str(r.name) ?? "",
        value: str(r.value) ?? "",
        status: str(r.status) ?? "MISSING",
        priority: typeof r.priority === "number" ? r.priority : undefined,
      }))
    : [];
  return {
    domainId: str(raw.domain_id) ?? str(raw.domain) ?? "",
    domain: str(raw.domain) ?? "",
    status: str(raw.status) ?? "PENDING",
    records,
  };
}

/** Register a custom sending domain; the response carries the DNS records
 *  to publish (MX to AgentMail, SPF TXT, DKIM CNAMEs, DMARC TXT). Idempotent
 *  on the provider side for an already-registered domain (409 -> fetched). */
export async function createDomain(key: string, domain: string): Promise<AgentMailDomain> {
  try {
    const raw = await am<Record<string, unknown>>(key, "POST", "/domains", { domain, feedback_enabled: true });
    return parseDomain(raw);
  } catch (e) {
    if (e instanceof AgentMailError && e.status === 409) return getDomain(key, domain);
    throw e;
  }
}

export async function getDomain(key: string, domainIdOrName: string): Promise<AgentMailDomain> {
  const raw = await amGet<Record<string, unknown>>(key, `/domains/${encodeURIComponent(domainIdOrName)}`);
  return parseDomain(raw);
}

/** Ask AgentMail to re-check the DNS records now. Best-effort: not every
 *  plan exposes the endpoint, and a 404/405 simply means "poll getDomain". */
export async function verifyDomain(key: string, domainIdOrName: string): Promise<AgentMailDomain> {
  try {
    const raw = await am<Record<string, unknown>>(key, "POST", `/domains/${encodeURIComponent(domainIdOrName)}/verify`);
    return parseDomain(raw);
  } catch (e) {
    if (e instanceof AgentMailError && (e.status === 404 || e.status === 405)) return getDomain(key, domainIdOrName);
    throw e;
  }
}

/* ------------------------------ Webhooks ------------------------------ */

export const INBOUND_EVENT_TYPES = [
  "message.received",
  "message.received.spam",
  "message.bounced",
  "message.complained",
  "domain.verified",
] as const;

export async function createWebhook(
  key: string,
  input: { url: string; eventTypes?: string[]; clientId?: string },
): Promise<{ webhookId: string; secret: string }> {
  const raw = await am<Record<string, unknown>>(key, "POST", "/webhooks", {
    url: input.url,
    event_types: input.eventTypes ?? [...INBOUND_EVENT_TYPES],
    ...(input.clientId ? { client_id: input.clientId } : {}),
  });
  return { webhookId: str(raw.webhook_id) ?? "", secret: str(raw.secret) ?? "" };
}

/** Verify a webhook delivery (Svix-style svix-id / svix-timestamp /
 *  svix-signature headers, signed with the secret returned at creation).
 *  Returns the parsed body or null when the signature does not check out. */
export function verifyWebhook(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
): Record<string, unknown> | null {
  if (!headers.id || !headers.timestamp || !headers.signature) return null;
  try {
    const wh = new Webhook(secret);
    return wh.verify(rawBody, {
      "svix-id": headers.id,
      "svix-timestamp": headers.timestamp,
      "svix-signature": headers.signature,
    }) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ---------------- Legacy: per-user key, read-only threads ---------------- */

export interface AgentMailThread {
  id: string;
  subject: string;
  preview?: string;
  updatedAt?: string;
  from?: string;
}

// Fetch threads (across the account's inboxes) that involve a given contact email.
export async function getThreadsForContact(
  key: string,
  email: string,
  max = 25
): Promise<AgentMailThread[]> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return [];

  // 1) List inboxes.
  const inboxesRes = await amGet<{ inboxes?: unknown[]; data?: unknown[] }>(key, "/inboxes");
  const inboxes = (inboxesRes.inboxes ?? inboxesRes.data ?? []) as Record<string, unknown>[];

  const out: AgentMailThread[] = [];
  for (const inbox of inboxes.slice(0, 5)) {
    const inboxId =
      str(inbox.inbox_id) ?? str(inbox.id) ?? str(inbox.email_address) ?? str(inbox.address);
    if (!inboxId) continue;

    let threadsRes: { threads?: unknown[]; data?: unknown[] };
    try {
      threadsRes = await amGet(key, `/inboxes/${encodeURIComponent(inboxId)}/threads?limit=100`);
    } catch {
      continue;
    }
    const threads = (threadsRes.threads ?? threadsRes.data ?? []) as Record<string, unknown>[];

    for (const t of threads) {
      // Match the contact by their email appearing anywhere in the thread.
      if (!JSON.stringify(t).toLowerCase().includes(wanted)) continue;
      const last = (t.last_message ?? t.latest_message) as Record<string, unknown> | undefined;
      out.push({
        id: str(t.thread_id) ?? str(t.id) ?? "",
        subject: str(t.subject) ?? "(no subject)",
        preview: str(t.preview) ?? str(t.snippet) ?? str(last?.text) ?? str(last?.preview),
        updatedAt: str(t.updated_at) ?? str(t.timestamp) ?? str(t.created_at),
        from: str(last?.from) ?? str(t.from),
      });
    }
  }

  return out
    .filter((t) => t.id)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, max);
}
