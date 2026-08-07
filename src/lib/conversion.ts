// Money, part 2: the discipline around the columns.
//
// PipelineEntry.amount + currency is what the customer pays and is NEVER
// converted in place. baseAmount (denominated in baseCurrency) is the ONLY
// column a total, chart, average, sort or forecast may touch, and the rate
// that produced it is frozen at write time. The reasoning for each rule, and
// the specific wrong number each one prevents, is in
// docs/engineering/currency.md.
//
// Every figure here is a Prisma.Decimal (decimal.js). No money value is ever
// widened to a JS number except at the moment it is formatted for a human.

import { Prisma, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import {
  Decimal,
  dedupeCurrencyCodes,
  formatMoney,
  normalizeCurrency,
  requireCurrency,
  resolveRate,
  resolveRates,
  type ResolvedRate,
} from "@/lib/currency";

/** The four frozen columns. baseCurrency is written by every writer of
 *  baseAmount, in the same statement: a figure converted against a base
 *  nobody recorded is indistinguishable from a correct one. */
export interface FrozenFields {
  baseAmount: Decimal | null;
  baseCurrency: string | null;
  fxRate: Decimal | null;
  fxRateAt: Date | null;
}

/** The frozen columns plus the untouched customer-facing pair, which is what
 *  a writer actually persists. */
export interface MoneyWrite extends FrozenFields {
  amount: Decimal | null;
  currency: string | null;
}

/** amount is Decimal(14,2), so the largest storable figure is just under
 *  10^12. Refusing above that here turns a database error into a message. */
const MAX_AMOUNT = new Decimal("999999999999.99");

/** Stages a deal is closed in. See rerateAll for why they are treated
 *  differently from open ones. */
export const CLOSED_STAGES: PipelineStage[] = [PipelineStage.WON, PipelineStage.LOST];

/** Parse an incoming amount into the stored Decimal, or null for "no amount".
 *  Rounds to the column's 2 decimal places rather than letting Postgres do it
 *  silently, so what we return is exactly what will be stored. */
export function toAmount(value: Decimal | string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  let d: Decimal;
  try {
    d = new Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new OpError("amount must be a number.", 400);
  }
  if (!d.isFinite()) throw new OpError("amount must be a finite number.", 400);
  if (d.isNegative()) throw new OpError("amount cannot be negative.", 400);
  if (d.abs().gt(MAX_AMOUNT)) throw new OpError("amount is too large to store.", 400);
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Resolve the rate ONCE and freeze it.
 *
 * Converting on read makes a closed quarter change value every morning, so
 * the rate that applied at write time is stored on the row (fxRate/fxRateAt)
 * and never recomputed except by rerateAll.
 *
 * A missing rate returns nulls across all four columns: disclosed, not
 * zeroed. The row then falls out of _sum automatically and is caught by
 * pendingWhere so it can be COUNTED and reported as "not included".
 */
export async function dealFields(
  userId: string,
  input: { amount: Decimal | string | number | null | undefined; currency: string | null | undefined },
  base: string,
): Promise<FrozenFields> {
  const b = requireCurrency(base, "reporting currency");
  const amount = toAmount(input.amount);
  // No amount means no conversion, and it clears any previously frozen rate:
  // a rate hanging off a deal with no value is a fact about nothing.
  if (amount === null) return { baseAmount: null, baseCurrency: null, fxRate: null, fxRateAt: null };

  // An amount with no currency is taken as the reporting currency at write
  // time. The caller persists that resolved code alongside (see moneyUpdate),
  // so the record never stays ambiguous.
  const quote =
    input.currency === null || input.currency === undefined || input.currency === ""
      ? b
      : requireCurrency(input.currency, "currency");

  // Rates are per tenant, so the resolve is scoped like every other read.
  const resolved: ResolvedRate | null = await resolveRate(userId, b, quote);
  if (!resolved) return { baseAmount: null, baseCurrency: null, fxRate: null, fxRateAt: null };

  return {
    // Decimal multiplication, rounded to the baseAmount column's 4 places.
    baseAmount: amount.times(resolved.rate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
    baseCurrency: b,
    fxRate: new Decimal(resolved.rate),
    fxRateAt: resolved.asOf,
  };
}

/**
 * The money half of an update.
 *
 * Returns null when neither amount nor currency is in the patch, so a stage
 * move or a note edit cannot re-resolve a frozen rate. When one of them IS in
 * the patch, the other is read back off the existing row in the same call:
 * changing only the currency of a 5,000 deal must re-rate 5,000, not null it.
 */
export async function moneyUpdate(
  userId: string,
  existing: { amount: Decimal | null; currency: string | null } | null,
  patch: { amount?: Decimal | string | number | null; currency?: string | null },
  base: string,
): Promise<MoneyWrite | null> {
  if (patch.amount === undefined && patch.currency === undefined) return null;

  const amount = toAmount(patch.amount !== undefined ? patch.amount : (existing?.amount ?? null));
  const rawCurrency = patch.currency !== undefined ? patch.currency : (existing?.currency ?? null);
  const currency = amount === null ? null : rawCurrency;

  const frozen = await dealFields(userId, { amount, currency }, base);
  return {
    amount,
    // Persist the canonical code (" usd " becomes USD) and, when the caller
    // sent an amount with no currency at all, the reporting currency the
    // conversion actually used.
    currency: amount === null ? null : (normalizeCurrency(currency) ?? requireCurrency(base)),
    ...frozen,
  };
}

// ── Filters ────────────────────────────────────────────────────────────────
// Composed with AND, never object spread: the pending filter contains an OR
// and so does the deals list's own where clause, and two OR keys in one
// object literal means the second silently wins.

/** AND-compose where clauses. Undefined clauses drop out. */
export function andWhere(
  ...clauses: (Prisma.PipelineEntryWhereInput | undefined | null)[]
): Prisma.PipelineEntryWhereInput {
  const parts = clauses.filter((c): c is Prisma.PipelineEntryWhereInput => Boolean(c));
  return { AND: parts };
}

/** Rows a total may include: converted, and converted against THIS base. */
export function countedWhere(base: string): Prisma.PipelineEntryWhereInput {
  return { baseCurrency: requireCurrency(base, "reporting currency"), baseAmount: { not: null } };
}

/**
 * Rows that carry money but are NOT in the total for `base`.
 *
 * The null branch is the entire point. In SQL and in Prisma, `{ not: base }`
 * does not match a NULL column, so a deal whose rate could not be resolved,
 * which is exactly the deal you need to disclose, is invisible to the obvious
 * query. Match NULL explicitly.
 */
export function pendingWhere(base: string): Prisma.PipelineEntryWhereInput {
  const b = requireCurrency(base, "reporting currency");
  return {
    amount: { not: null },
    OR: [
      { baseCurrency: null }, // NOT matched by { not: b } - the invisible row
      { baseCurrency: { not: b } },
      { baseAmount: null }, // stamped with a base but never converted
    ],
  };
}

export interface MoneyTotals {
  base: string;
  /** Decimal string, never a JS number. */
  total: string;
  totalFormatted: string;
  /** Deals included in `total`. */
  counted: number;
  /** Deals with an amount that could NOT be included. Never folded into the
   *  total as a zero: surfaced so the caller can say so out loud. */
  unconverted: number;
  unconvertedByCurrency: { currency: string | null; count: number }[];
  /** Ready-to-show disclosure, null when nothing is missing. */
  disclosure: string | null;
}

/**
 * Sum baseAmount for one user, in their reporting currency, alongside the
 * count of rows the sum could not include. The two always travel together: a
 * total without its exclusions is a confident wrong number.
 */
export async function moneyTotals(
  userId: string,
  base: string,
  scope?: Prisma.PipelineEntryWhereInput,
): Promise<MoneyTotals> {
  const b = requireCurrency(base, "reporting currency");
  const mine: Prisma.PipelineEntryWhereInput = { userId };

  const [agg, pending] = await Promise.all([
    prisma.pipelineEntry.aggregate({
      where: andWhere(mine, countedWhere(b), scope),
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
    prisma.pipelineEntry.groupBy({
      by: ["currency"],
      where: andWhere(mine, pendingWhere(b), scope),
      _count: { _all: true },
    }),
  ]);

  const total = agg._sum.baseAmount ? new Decimal(agg._sum.baseAmount) : new Decimal(0);
  const byCurrency = pending
    .map((row) => ({ currency: row.currency ?? null, count: row._count._all }))
    .sort((a, b2) => b2.count - a.count);
  const unconverted = byCurrency.reduce((n, row) => n + row.count, 0);

  return {
    base: b,
    total: total.toFixed(2),
    totalFormatted: formatMoney(total, b),
    counted: agg._count._all,
    unconverted,
    unconvertedByCurrency: byCurrency,
    disclosure: unconverted
      ? `${unconverted} deal${unconverted === 1 ? "" : "s"} ${
          unconverted === 1 ? "is" : "are"
        } not included in this total (no rate into ${b}): ${byCurrency
          .map((row) => `${row.count} in ${row.currency ?? "an unknown currency"}`)
          .join(", ")}.`
      : null,
  };
}

/** One pass writes at most this many rows. A book bigger than this converts
 *  over repeated passes rather than timing out halfway through with no idea
 *  of what got written. */
const MAX_PASS = 2000;

export interface ConversionPass {
  base: string;
  scanned: number;
  converted: number;
  /** Rows left alone because they were already converted. */
  skipped: number;
  /** Currencies with no usable rate, and how many deals are waiting on one. */
  unresolved: { currency: string; count: number }[];
  /** True when the pass hit its row cap and more deals are still waiting. */
  truncated: boolean;
}

/**
 * Convert deals that have an amount but no baseAmount yet.
 *
 * Never touches an already-converted deal. The frozen rate on such a row is a
 * record of what was true when it was written, and quietly refreshing it is
 * how a closed quarter starts moving. The `baseAmount: null` clause in the
 * query says so, and the in-loop guard says so again in case some future
 * caller passes a looser scope.
 */
export async function fillMissing(
  userId: string,
  base: string,
  scope?: Prisma.PipelineEntryWhereInput,
): Promise<ConversionPass> {
  const b = requireCurrency(base, "reporting currency");
  const rows = await prisma.pipelineEntry.findMany({
    where: andWhere({ userId }, { amount: { not: null } }, { baseAmount: null }, scope),
    select: { id: true, amount: true, currency: true, baseAmount: true },
    take: MAX_PASS,
  });

  const rates = await resolveRates(userId, b, rows.map((r) => r.currency ?? b));
  const unresolved = new Map<string, number>();
  let converted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.baseAmount !== null) {
      skipped++;
      continue;
    }
    const code = normalizeCurrency(row.currency) ?? b;
    const rate = rates.get(code) ?? null;
    if (!rate) {
      unresolved.set(code, (unresolved.get(code) ?? 0) + 1);
      continue;
    }
    const amount = toAmount(row.amount);
    if (amount === null) continue;
    await prisma.pipelineEntry.updateMany({
      // userId on the write itself, not just on the read that found the row.
      where: { id: row.id, userId },
      data: {
        baseAmount: amount.times(rate.rate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
        baseCurrency: b,
        fxRate: new Decimal(rate.rate),
        fxRateAt: rate.asOf,
      },
    });
    converted++;
  }

  return {
    base: b,
    scanned: rows.length,
    converted,
    skipped,
    unresolved: [...unresolved.entries()].map(([currency, count]) => ({ currency, count })),
    truncated: rows.length === MAX_PASS,
  };
}

export interface RerateResult extends ConversionPass {
  /** Closed deals deliberately left in their original reporting currency. */
  closedLeftAlone: number;
}

/**
 * Re-rate OPEN deals into a new reporting currency. This is the only thing in
 * the codebase that overwrites a frozen rate, and it runs only when the user
 * changes their reporting currency.
 *
 * WHY CLOSED DEALS ARE LEFT ALONE. A WON deal is booked revenue: it was worth
 * what it was worth on the day it closed, at the rate that was true then.
 * Re-rating it restates history, and a number that moves after the fact is a
 * number nobody can reconcile against an invoice. LOST deals are history for
 * the same reason. Open deals have not been booked, so restating them in the
 * currency the operator now reports in is simply the current expectation of
 * the same future cash, which is the honest figure.
 *
 * The consequence is deliberate and must be surfaced, not hidden: after a
 * currency change, closed deals still carry the old baseCurrency, so they are
 * excluded from totals in the new base and COUNTED as unconverted by
 * pendingWhere. Excluded and disclosed beats silently added to a total in the
 * wrong denomination.
 */
export async function rerateAll(userId: string, newBase: string): Promise<RerateResult> {
  const b = requireCurrency(newBase, "reporting currency");

  const notInNewBase: Prisma.PipelineEntryWhereInput = {
    // Explicit null branch again: a deal that never got a rate has a null
    // baseCurrency and { not: b } would skip exactly the rows most in need
    // of another attempt.
    OR: [{ baseCurrency: null }, { baseCurrency: { not: b } }],
  };

  const [rows, closedLeftAlone] = await Promise.all([
    prisma.pipelineEntry.findMany({
      where: andWhere(
        { userId },
        { amount: { not: null } },
        { stage: { notIn: CLOSED_STAGES } },
        notInNewBase,
      ),
      select: { id: true, amount: true, currency: true },
      take: MAX_PASS,
    }),
    prisma.pipelineEntry.count({
      where: andWhere({ userId }, { amount: { not: null } }, { stage: { in: CLOSED_STAGES } }, notInNewBase),
    }),
  ]);

  const rates = await resolveRates(userId, b, rows.map((r) => r.currency ?? b));
  const unresolved = new Map<string, number>();
  let converted = 0;

  for (const row of rows) {
    const code = normalizeCurrency(row.currency) ?? b;
    const rate = rates.get(code) ?? null;
    if (!rate) {
      // Leave the previous frozen conversion in place rather than nulling it.
      // countedWhere already excludes it (wrong base), pendingWhere already
      // counts it, and the old figure is better provenance than no figure.
      unresolved.set(code, (unresolved.get(code) ?? 0) + 1);
      continue;
    }
    const amount = toAmount(row.amount);
    if (amount === null) continue;
    await prisma.pipelineEntry.updateMany({
      where: { id: row.id, userId },
      data: {
        baseAmount: amount.times(rate.rate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
        baseCurrency: b,
        fxRate: new Decimal(rate.rate),
        fxRateAt: rate.asOf,
      },
    });
    converted++;
  }

  return {
    base: b,
    scanned: rows.length,
    converted,
    skipped: 0,
    unresolved: [...unresolved.entries()].map(([currency, count]) => ({ currency, count })),
    truncated: rows.length === MAX_PASS,
    closedLeftAlone,
  };
}

/** Deals ordered by value, in the user's reporting currency. Sorting on
 *  `amount` would rank a 900,000 JPY deal above a 50,000 USD one, so the sort
 *  key is baseAmount and only converted rows can be ranked at all. The rest
 *  are counted and disclosed by the caller. */
export async function dealsByValue(
  userId: string,
  base: string,
  opts: { limit?: number; direction?: "desc" | "asc"; scope?: Prisma.PipelineEntryWhereInput } = {},
) {
  const b = requireCurrency(base, "reporting currency");
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  return prisma.pipelineEntry.findMany({
    where: andWhere({ userId }, countedWhere(b), opts.scope),
    orderBy: { baseAmount: opts.direction === "asc" ? "asc" : "desc" },
    take: limit,
    select: {
      id: true,
      pipelineId: true,
      stage: true,
      conversationStatus: true,
      dealScore: true,
      amount: true,
      currency: true,
      baseAmount: true,
      baseCurrency: true,
      fxRate: true,
      fxRateAt: true,
      expectedCloseDate: true,
      contact: { select: { id: true, name: true, email: true, company: true } },
    },
  });
}

/** Serialise a deal's money for JSON: Decimal strings, never floats, plus a
 *  formatted figure for display. */
export function serializeMoney(entry: {
  amount: Decimal | null;
  currency: string | null;
  baseAmount: Decimal | null;
  baseCurrency: string | null;
  fxRate: Decimal | null;
  fxRateAt: Date | null;
}) {
  return {
    amount: entry.amount ? new Decimal(entry.amount).toFixed(2) : null,
    currency: entry.currency,
    amountFormatted: entry.amount && entry.currency ? formatMoney(entry.amount, entry.currency) : null,
    baseAmount: entry.baseAmount ? new Decimal(entry.baseAmount).toFixed(2) : null,
    baseCurrency: entry.baseCurrency,
    baseAmountFormatted:
      entry.baseAmount && entry.baseCurrency ? formatMoney(entry.baseAmount, entry.baseCurrency) : null,
    fxRate: entry.fxRate ? new Decimal(entry.fxRate).toString() : null,
    fxRateAt: entry.fxRateAt ? entry.fxRateAt.toISOString() : null,
    // The honest state of this one row, for a UI that must not imply a deal
    // with no rate is worth zero.
    converted: entry.baseAmount !== null && entry.baseCurrency !== null,
  };
}

/** Currency codes in use by a user's deals, for the settings surface's
 *  "you need a rate for these" list. Deduplicated case-insensitively. */
export async function currenciesInUse(userId: string): Promise<string[]> {
  const rows = await prisma.pipelineEntry.groupBy({
    by: ["currency"],
    where: andWhere({ userId }, { amount: { not: null } }),
    _count: { _all: true },
  });
  return dedupeCurrencyCodes(rows.map((r) => r.currency)).sort();
}
