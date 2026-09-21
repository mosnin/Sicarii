// Wire shapes for /api/mail/* as the client sees them (Dates arrive as ISO
// strings). Mirrors the *View types in src/lib/mailbox-operations.ts.

export type MailboxProvider = "AGENTMAIL" | "SMTP";
export type MailboxStatus = "PROVISIONING" | "WARMING" | "ACTIVE" | "PAUSED" | "DISABLED";
export type MailDomainStatus = "PENDING_PURCHASE" | "PURCHASED" | "VERIFIED" | "FAILED";
export type OrderStatus = "PENDING" | "PAID" | "FULFILLED" | "ACTION_REQUIRED" | "FAILED" | "CANCELED";
export type InboundClass = "REPLY" | "BOUNCE" | "UNSUBSCRIBE" | "OUT_OF_OFFICE" | "WARMUP" | "OTHER";

export interface MailboxRow {
  id: string;
  address: string;
  displayName: string | null;
  provider: MailboxProvider;
  status: MailboxStatus;
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
  lastErrorAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface DnsRecordRow {
  type: string;
  name: string;
  data: string;
  ttl?: number;
  priority?: number;
}

export interface DomainRow {
  id: string;
  domain: string;
  registrar: string;
  status: MailDomainStatus;
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  mxOk: boolean;
  dnsCheckedAt: string | null;
  connectedToAgentMail: boolean;
  dnsRecords: DnsRecordRow[];
  findings: string[];
  mailboxCount: number;
  purchasedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface OrderRow {
  id: string;
  kind: "DOMAIN" | "INBOXES";
  status: OrderStatus;
  vendor: string;
  domain: string | null;
  quantity: number;
  amountUsdCents: number;
  note: string | null;
  checkoutUrl?: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  mailboxId: string;
  contactId: string | null;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  fromAddr: string;
  toAddr: string;
  subject: string | null;
  text: string | null;
  classification: InboundClass | null;
  classifierNote: string | null;
  threadKey: string | null;
  isWarmup: boolean;
  error: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

export interface Capabilities {
  agentmail: boolean;
  smtp: boolean;
  registrar: "GODADDY" | "PORKBUN" | null;
  billing: boolean;
  inboxPriceUsdCents: number;
  domainMarkupUsdCents: number;
  maxInboxesPerDomain: number;
}

export interface MailStatus {
  capabilities: Capabilities;
  mailboxes: MailboxRow[];
  domains: DomainRow[];
  orders: OrderRow[];
}

export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export async function mailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
