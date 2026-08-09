// Suppression: the opt-out ledger, and the one check every outbound path runs
// before it reaches a person.
//
// The schema had the tables (SuppressedContact by email, SuppressedDomain by
// domain, each scoped INBOUND | OUTBOUND | ALL) but nothing managed them and
// only voice do_not_call ever wrote one. This module is the management surface
// (add/remove/list) plus the enforcement primitive (assertNotSuppressed) that
// the email send path, the voice dial path, and inbound auto-create all share,
// so "honor opt-outs" is one rule with one implementation rather than a promise
// re-decided per channel.
//
// SCOPES, read as "blocks what":
//   INBOUND  - do not auto-create a contact from this address on mailbox sync
//   OUTBOUND - do not send to it (email or dial)
//   ALL      - both
// A check for an outbound send therefore matches OUTBOUND and ALL; inbound
// matches INBOUND and ALL. Nothing is symmetric by accident.

import type { Prisma, SuppressionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";

/** Scopes that block a given direction. */
const OUTBOUND_SCOPES: SuppressionScope[] = ["OUTBOUND", "ALL"];
const INBOUND_SCOPES: SuppressionScope[] = ["INBOUND", "ALL"];

export type SuppressionDirection = "outbound" | "inbound";

function scopesFor(direction: SuppressionDirection): SuppressionScope[] {
  return direction === "outbound" ? OUTBOUND_SCOPES : INBOUND_SCOPES;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

export interface SuppressionHit {
  suppressed: boolean;
  /** Why, for a log line or an operator-facing message. Never the raw value in
   *  a place it should not be, but the matched domain/email is the operator's
   *  own data so it is safe to return to them. */
  reason?: string;
  matched?: "email" | "domain";
}

/**
 * Is this address suppressed for the given direction, within this tenant?
 * Exact email match (case-insensitive) OR its domain. No name matching, ever.
 */
export async function checkSuppressed(
  userId: string,
  email: string,
  direction: SuppressionDirection = "outbound",
): Promise<SuppressionHit> {
  const addr = normalizeEmail(email);
  if (!addr) return { suppressed: false };
  const scopes = scopesFor(direction);
  const domain = domainOf(addr);

  const [contactHit, domainHit] = await Promise.all([
    prisma.suppressedContact.findFirst({
      where: { userId, email: { equals: addr, mode: "insensitive" }, scope: { in: scopes } },
      select: { email: true },
    }),
    domain
      ? prisma.suppressedDomain.findFirst({
          where: { userId, domain: { equals: domain, mode: "insensitive" }, scope: { in: scopes } },
          select: { domain: true },
        })
      : Promise.resolve(null),
  ]);

  if (contactHit) return { suppressed: true, matched: "email", reason: `${contactHit.email} is on your suppression list` };
  if (domainHit) return { suppressed: true, matched: "domain", reason: `the domain ${domainHit.domain} is on your suppression list` };
  return { suppressed: false };
}

export class SuppressedRecipientError extends OpError {
  constructor(reason: string) {
    super(`This recipient is suppressed, so nothing was sent: ${reason}. Remove the suppression first if this is intentional.`, 409);
    this.name = "SuppressedRecipientError";
  }
}

/** Throw unless the address may be contacted in this direction. The single
 *  gate the send and dial paths call; callers never re-implement the query. */
export async function assertNotSuppressed(
  userId: string,
  email: string,
  direction: SuppressionDirection = "outbound",
): Promise<void> {
  const hit = await checkSuppressed(userId, email, direction);
  if (hit.suppressed) throw new SuppressedRecipientError(hit.reason ?? "on your suppression list");
}

/* ----------------------------- management ----------------------------- */

export interface AddSuppressionInput {
  /** Supply exactly one of email or domain. */
  email?: string | null;
  domain?: string | null;
  scope?: SuppressionScope;
  reason?: string | null;
}

/** Add (or update the scope/reason of) one suppression. Idempotent on the
 *  tenant-scoped unique key, so re-adding is a no-op update rather than a
 *  duplicate. */
export async function addSuppression(userId: string, input: AddSuppressionInput) {
  const email = input.email ? normalizeEmail(input.email) : null;
  const domain = input.domain ? input.domain.trim().toLowerCase().replace(/^@/, "") : null;
  if ((email && domain) || (!email && !domain)) {
    throw new OpError("Supply exactly one of email or domain.", 400);
  }
  const scope: SuppressionScope = input.scope ?? "ALL";
  const reason = input.reason?.slice(0, 500) ?? null;

  if (email) {
    if (!email.includes("@")) throw new OpError("That does not look like an email address.", 400);
    return prisma.suppressedContact.upsert({
      where: { userId_email: { userId, email } },
      update: { scope, reason },
      create: { userId, email, scope, reason },
    });
  }
  if (!domain || domain.includes("@") || !domain.includes(".")) {
    throw new OpError("That does not look like a domain.", 400);
  }
  return prisma.suppressedDomain.upsert({
    where: { userId_domain: { userId, domain } },
    update: { scope, reason },
    create: { userId, domain, scope, reason },
  });
}

/** Remove a suppression. Returns whether a row was actually removed, so a
 *  caller can tell "unsuppressed" from "was not suppressed". */
export async function removeSuppression(
  userId: string,
  input: { email?: string | null; domain?: string | null },
): Promise<{ removed: boolean }> {
  const email = input.email ? normalizeEmail(input.email) : null;
  const domain = input.domain ? input.domain.trim().toLowerCase().replace(/^@/, "") : null;
  if ((email && domain) || (!email && !domain)) {
    throw new OpError("Supply exactly one of email or domain.", 400);
  }
  if (email) {
    const { count } = await prisma.suppressedContact.deleteMany({ where: { userId, email } });
    return { removed: count > 0 };
  }
  const { count } = await prisma.suppressedDomain.deleteMany({ where: { userId, domain: domain! } });
  return { removed: count > 0 };
}

export interface SuppressionListItem {
  kind: "email" | "domain";
  value: string;
  scope: SuppressionScope;
  reason: string | null;
  createdAt: string;
}

/** List a tenant's suppressions, emails then domains, newest first within each. */
export async function listSuppressions(
  userId: string,
  opts: { limit?: number } = {},
): Promise<SuppressionListItem[]> {
  const take = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const [contacts, domains] = await Promise.all([
    prisma.suppressedContact.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
    prisma.suppressedDomain.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
  ]);
  const rows: SuppressionListItem[] = [
    ...contacts.map((c) => ({ kind: "email" as const, value: c.email, scope: c.scope, reason: c.reason, createdAt: c.createdAt.toISOString() })),
    ...domains.map((d) => ({ kind: "domain" as const, value: d.domain, scope: d.scope, reason: d.reason, createdAt: d.createdAt.toISOString() })),
  ];
  return rows;
}

/** Record an opt-out that came from a recipient action (an unsubscribe click,
 *  a "remove me" reply, a do_not_call on a phone call). Always scope ALL,
 *  because a person asking off your list means off every channel. Convenience
 *  wrapper over addSuppression so the intent is legible at every call site. */
export function recordOptOut(
  userId: string,
  email: string,
  reason: string,
  tx?: Prisma.TransactionClient,
) {
  const addr = normalizeEmail(email);
  const client = tx ?? prisma;
  return client.suppressedContact.upsert({
    where: { userId_email: { userId, email: addr } },
    update: { scope: "ALL", reason: reason.slice(0, 500) },
    create: { userId, email: addr, scope: "ALL", reason: reason.slice(0, 500) },
  });
}
