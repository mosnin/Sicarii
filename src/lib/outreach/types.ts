// Agent outreach mailboxes — shared types (Card 0015).
//
// One vocabulary for domains, mailboxes, warmup, sequences, and sends so the
// provider clients (godaddy / premium-inboxes / bird), the ops layer, the REST
// routes, the MCP tools, and the scheduler never drift apart. Statuses are
// strings (same convention as Activity.kind) — see schema.prisma.

export const DOMAIN_STATUSES = [
  "pending_payment",
  "registering",
  "active",
  "dns_pending",
  "failed",
  "external",
] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

export const MAILBOX_STATUSES = [
  "ordered",
  "provisioning",
  "warming",
  "ready",
  "paused",
  "burned",
] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const MAILBOX_PLATFORMS = ["google", "microsoft"] as const;
export type MailboxPlatform = (typeof MAILBOX_PLATFORMS)[number];

export const MAILBOX_PROVIDERS = ["premiuminboxes", "bird", "bring_your_own"] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];

export const ENROLLMENT_STATUSES = [
  "active",
  "paused",
  "completed",
  "bounced",
  "replied",
  "unsubscribed",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const SEND_STATUSES = [
  "pending_approval",
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "replied",
  "failed",
  "skipped",
] as const;
export type SendStatus = (typeof SEND_STATUSES)[number];

export const SUPPRESSION_REASONS = ["bounce", "complaint", "unsubscribe", "manual"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/** A single step in an OutreachSequence.steps JSON array. */
export interface SequenceStep {
  /** Days after enrollment (or after the previous step's send) to fire. */
  dayOffset: number;
  subject: string;
  body: string;
  /** When set, the send uses select_variant's pick for this pool instead of the literal. */
  variantKind: "subject" | "opener" | null;
}

export function isSequenceStep(v: unknown): v is SequenceStep {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.dayOffset === "number" &&
    Number.isInteger(s.dayOffset) &&
    s.dayOffset >= 0 &&
    typeof s.subject === "string" &&
    typeof s.body === "string" &&
    (s.variantKind === null ||
      s.variantKind === undefined ||
      s.variantKind === "subject" ||
      s.variantKind === "opener")
  );
}

export function parseSequenceSteps(v: unknown): SequenceStep[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 10) return null;
  const steps: SequenceStep[] = [];
  for (const raw of v) {
    if (!isSequenceStep(raw)) return null;
    steps.push({
      dayOffset: raw.dayOffset,
      subject: raw.subject.slice(0, 500),
      body: raw.body.slice(0, 50_000),
      variantKind: raw.variantKind ?? null,
    });
  }
  return steps;
}

function isIn<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

export function isDomainStatus(v: unknown): v is DomainStatus {
  return isIn(DOMAIN_STATUSES, v);
}
export function isMailboxStatus(v: unknown): v is MailboxStatus {
  return isIn(MAILBOX_STATUSES, v);
}
export function isMailboxPlatform(v: unknown): v is MailboxPlatform {
  return isIn(MAILBOX_PLATFORMS, v);
}
export function isMailboxProvider(v: unknown): v is MailboxProvider {
  return isIn(MAILBOX_PROVIDERS, v);
}
export function isSendStatus(v: unknown): v is SendStatus {
  return isIn(SEND_STATUSES, v);
}
export function isSuppressionReason(v: unknown): v is SuppressionReason {
  return isIn(SUPPRESSION_REASONS, v);
}

/** Normalize + validate a bare domain (no scheme, no path, no port). */
export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/\.$/, "");
  if (!d || d.length > 253 || d.includes("/") || d.includes(":") || d.includes(" ")) return null;
  const labels = d.split(".");
  if (labels.length < 2) return null;
  for (const label of labels) {
    if (!label || label.length > 63 || !/^[a-z0-9-]+$/.test(label)) return null;
    if (label.startsWith("-") || label.endsWith("-")) return null;
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) return null;
  return d;
}

/** Normalize an email address for storage/comparison (lowercase, trimmed). */
export function normalizeEmailAddr(input: string): string | null {
  const e = input.trim().toLowerCase();
  if (!e || e.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  const domain = normalizeDomain(e.split("@")[1] ?? "");
  if (!domain) return null;
  return `${e.split("@")[0]}@${domain}`;
}

/** Mailboxes that may carry cold volume right now. */
export function isSendEligibleStatus(status: string): boolean {
  return status === "ready";
}
