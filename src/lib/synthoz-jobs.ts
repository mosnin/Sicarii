// Correlation between a Scalar user's async Synthoz search and the result that
// later POSTs back to /api/webhooks/synthoz. Synthoz is a single developer
// account with no notion of our users, so we stamp a pending SynthozJob at call
// time and match the inbound webhook to it by the searched key (domain/company).

import { prisma } from "@/lib/prisma";

/** Normalize a domain/URL to a bare host: lowercase, no scheme, no www, no path. */
export function normDomain(input?: string | null): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split("#")[0];
  d = d.replace(/[.,;:]+$/, "").trim();
  return d || null;
}

/** Normalize a company name: lowercase, collapse whitespace. */
export function normCompany(input?: string | null): string | null {
  if (!input) return null;
  const c = input.trim().toLowerCase().replace(/\s+/g, " ");
  return c || null;
}

export interface SearchKeys {
  domain?: string | null;
  company?: string | null;
  url?: string | null;
}

/**
 * Stamp a pending job so an async webhook result can be attributed to `userId`.
 * No-op if neither a domain nor a company can be derived (nothing to match on).
 */
export async function recordSynthozJob(
  userId: string,
  action: string,
  keys: SearchKeys
): Promise<void> {
  const domainKey = normDomain(keys.domain ?? keys.url);
  const companyKey = normCompany(keys.company);
  if (!domainKey && !companyKey) return;
  try {
    await prisma.synthozJob.create({
      data: { userId, action, domainKey, companyKey },
    });
  } catch (e) {
    // Never let job bookkeeping break the actual search.
    console.error("[synthoz-jobs] failed to record job", e);
  }
}

const MATCH_WINDOW_MS = 60 * 60 * 1000; // ignore stale jobs older than an hour

/**
 * Find the owner for an inbound webhook record by matching the most recent
 * pending job on domain or company, and mark that job resolved. Falls back to
 * the sole user on single-user deployments. Returns null if unattributable.
 */
export async function resolveSynthozOwner(keys: SearchKeys): Promise<string | null> {
  const domainKey = normDomain(keys.domain ?? keys.url);
  const companyKey = normCompany(keys.company);

  const or: { domainKey?: string; companyKey?: string }[] = [];
  if (domainKey) or.push({ domainKey });
  if (companyKey) or.push({ companyKey });

  if (or.length) {
    const job = await prisma.synthozJob.findFirst({
      where: {
        status: "pending",
        createdAt: { gte: new Date(Date.now() - MATCH_WINDOW_MS) },
        OR: or,
      },
      orderBy: { createdAt: "desc" },
    });
    if (job) {
      await prisma.synthozJob.update({
        where: { id: job.id },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      return job.userId;
    }
  }

  // Single-user deployment: no ambiguity, attribute to the only account.
  if (await prisma.user.count() === 1) {
    const only = await prisma.user.findFirst({ select: { id: true } });
    return only?.id ?? null;
  }

  return null;
}
