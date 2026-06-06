// Creation circuit breaker. Caps how many CRM records one account can accrue in
// a short window so no ingestion source (a bad/abused webhook, a runaway loop, a
// scraper) can ever flood the CRM again the way the Synthoz firehose did. Counts
// real rows in the DB, so it holds across serverless instances (unlike the
// in-memory request rate limiter).

import { prisma } from "@/lib/prisma";

export interface BudgetResult {
  ok: boolean;
  recent: number;
  limit: number;
  windowMinutes: number;
}

const DEFAULT_WINDOW_MINUTES = 10;
const DEFAULT_LIMIT = 1000;

// How many entities + contacts the user has created in the recent window, and
// whether they're still under budget. `ok: false` means "cooling down" - callers
// should stop auto-ingesting until the window passes.
export async function checkCreationBudget(
  userId: string,
  opts: { windowMinutes?: number; limit?: number } = {},
): Promise<BudgetResult> {
  const windowMinutes = opts.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const since = new Date(Date.now() - windowMinutes * 60_000);

  const [entities, contacts] = await Promise.all([
    prisma.entity.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.contact.count({ where: { userId, createdAt: { gte: since } } }),
  ]);

  const recent = entities + contacts;
  return { ok: recent < limit, recent, limit, windowMinutes };
}
