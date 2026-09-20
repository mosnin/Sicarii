// Case-insensitive, alias-tolerant parsing for the small set of enum-like
// inputs the MCP server and the in-app agent accept (social channel, message
// direction, activity kind). An agent naturally emits these in whatever
// casing nearby docs, a database's own output, or a prior tool result used -
// the tool contract should absorb that instead of making the agent memorize
// arbitrary casing. Each normalizer returns the CANONICAL value the ops layer
// and database expect, or null when the input matches nothing known, so a
// caller can raise one clear error instead of a raw schema mismatch.

import { OpError } from "@/lib/crm-operations";
import type { SocialChannelName } from "@/lib/crm-operations";
import type { VariantKind } from "@/lib/variant-operations";

const SOCIAL_CHANNEL_ALIASES: Record<string, SocialChannelName> = {
  linkedin: "LINKEDIN",
  x: "X",
  twitter: "X",
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  other: "OTHER",
};

/** "linkedin" / "LINKEDIN" / "twitter" / "X" / ... -> the canonical
 *  SocialChannelName the database and ops layer expect, or null. */
export function normalizeSocialChannel(input: string): SocialChannelName | null {
  return SOCIAL_CHANNEL_ALIASES[input.trim().toLowerCase()] ?? null;
}

/** "inbound" / "INBOUND" / "Outbound" / ... -> "INBOUND" | "OUTBOUND", or null. */
export function normalizeDirection(input: string): "INBOUND" | "OUTBOUND" | null {
  const v = input.trim().toUpperCase();
  return v === "INBOUND" || v === "OUTBOUND" ? v : null;
}

export type ActivityKind = "note" | "call" | "outreach" | "reply" | "status_change";
const ACTIVITY_KINDS: ReadonlySet<string> = new Set([
  "note",
  "call",
  "outreach",
  "reply",
  "status_change",
]);

/** "NOTE" / "note" / "Status_Change" / ... -> the canonical lowercase
 *  ActivityKind the database expects, or null. */
export function normalizeActivityKind(input: string): ActivityKind | null {
  const v = input.trim().toLowerCase();
  return ACTIVITY_KINDS.has(v) ? (v as ActivityKind) : null;
}

const VARIANT_KIND_ALIASES: Record<string, VariantKind> = {
  subject: "SUBJECT",
  opener: "OPENER",
};

/** "subject" / "SUBJECT" / "opener" / "Opener" / ... -> the canonical
 *  VariantKind ("SUBJECT" | "OPENER") the database and ops layer expect, or
 *  null. Same forgiving-casing convention as the other enum normalizers
 *  above, for the self-optimizing outreach bandit's create_variant /
 *  select_variant tool inputs. */
export function normalizeVariantKind(input: string): VariantKind | null {
  return VARIANT_KIND_ALIASES[input.trim().toLowerCase()] ?? null;
}

/**
 * Normalize `value` with `normalize`, or throw a clear OpError naming the
 * field and the accepted values (case-insensitive) instead of surfacing a
 * raw enum mismatch. Used by every MCP/agent tool that takes one of the
 * enum-like inputs above, so a wrong-cased value fails with guidance an agent
 * can immediately act on rather than a bare validation error.
 */
export function requireNormalized<T>(
  value: string,
  normalize: (input: string) => T | null,
  field: string,
  accepted: string,
): T {
  const canonical = normalize(value);
  if (canonical === null) {
    throw new OpError(
      `${field} must be one of ${accepted} (case-insensitive); got "${value}".`,
      400,
    );
  }
  return canonical;
}
