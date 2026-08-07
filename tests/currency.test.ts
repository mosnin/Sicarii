// Money discipline tests.
//
// Each case here is a wrong number that shipped somewhere once: a total that
// added euros to dollars, a "needs conversion" filter that could not see the
// rows that needed conversion, a closed quarter that changed value overnight,
// a missing rate quietly treated as 1.
//
// The prisma mock is not a stub returning canned rows: it evaluates the where
// clause the code actually builds, with SQL's NULL semantics (`{ not: x }`
// does NOT match NULL). That is the only way a test can prove the null-safe
// filter is really null-safe rather than just differently shaped.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { Prisma } = await import("@prisma/client");
  const D = Prisma.Decimal;

  type Row = Record<string, unknown>;
  const db: { entries: Row[]; rates: Row[]; users: Row[] } = { entries: [], rates: [], users: [] };

  // SQL / Prisma comparison semantics, including the trap: a NOT comparison
  // never matches NULL, so a null column is invisible to `{ not: x }`.
  function fieldMatches(value: unknown, cond: unknown): boolean {
    if (cond === null) return value === null || value === undefined;
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("not" in c) {
        if (c.not === null) return value !== null && value !== undefined;
        if (value === null || value === undefined) return false; // the trap
        return value !== c.not;
      }
      if ("in" in c) {
        if (value === null || value === undefined) return false;
        return (c.in as unknown[]).includes(value);
      }
      if ("notIn" in c) {
        if (value === null || value === undefined) return false;
        return !(c.notIn as unknown[]).includes(value);
      }
      if ("equals" in c) return value === c.equals;
    }
    return value === cond;
  }

  function matches(row: Row, where: unknown): boolean {
    if (!where || typeof where !== "object") return true;
    for (const [key, cond] of Object.entries(where as Record<string, unknown>)) {
      if (key === "AND") {
        if (!(cond as unknown[]).every((c) => matches(row, c))) return false;
      } else if (key === "OR") {
        if (!(cond as unknown[]).some((c) => matches(row, c))) return false;
      } else if (key === "NOT") {
        if (matches(row, cond)) return false;
      } else if (!fieldMatches(row[key], cond)) {
        return false;
      }
    }
    return true;
  }

  const prisma = {
    __db: db,
    __matches: matches,
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        db.users.find((u) => u.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const u = db.users.find((x) => x.id === where.id);
        if (u) Object.assign(u, data);
        return u;
      }),
    },
    exchangeRate: {
      findMany: vi.fn(async ({ where }: { where?: unknown } = {}) =>
        db.rates.filter((r) => matches(r, where)),
      ),
      upsert: vi.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        // The unique key is the 4-tuple including userId, so a second tenant
        // setting the same pair must create a row, not update someone else's.
        const key = (where as { userId_baseCurrency_quoteCurrency_source: Row })
          .userId_baseCurrency_quoteCurrency_source;
        const existing = db.rates.find(
          (r) =>
            r.userId === key.userId &&
            r.baseCurrency === key.baseCurrency &&
            r.quoteCurrency === key.quoteCurrency &&
            r.source === key.source,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `rate-${db.rates.length + 1}`, ...create };
        db.rates.push(row);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: { where: unknown }) => {
        const keep = db.rates.filter((r) => !matches(r, where));
        const count = db.rates.length - keep.length;
        db.rates = keep;
        return { count };
      }),
    },
    pipelineEntry: {
      findMany: vi.fn(async ({ where, take }: { where?: unknown; take?: number } = {}) => {
        const rows = db.entries.filter((e) => matches(e, where));
        return take ? rows.slice(0, take) : rows;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        db.entries.find((e) => e.id === where.id) ?? null,
      ),
      count: vi.fn(async ({ where }: { where?: unknown } = {}) =>
        db.entries.filter((e) => matches(e, where)).length,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = db.entries.find((e) => e.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: unknown; data: Row }) => {
        const rows = db.entries.filter((e) => matches(e, where));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      }),
      aggregate: vi.fn(async ({ where }: { where?: unknown } = {}) => {
        const rows = db.entries.filter((e) => matches(e, where));
        const sum = rows.reduce(
          (acc: InstanceType<typeof D>, r) => (r.baseAmount ? acc.plus(new D(r.baseAmount as string)) : acc),
          new D(0),
        );
        return { _sum: { baseAmount: rows.length ? sum : null }, _count: { _all: rows.length } };
      }),
      groupBy: vi.fn(async ({ where }: { where?: unknown } = {}) => {
        const rows = db.entries.filter((e) => matches(e, where));
        const counts = new Map<unknown, number>();
        for (const r of rows) counts.set(r.currency ?? null, (counts.get(r.currency ?? null) ?? 0) + 1);
        return [...counts.entries()].map(([currency, n]) => ({ currency, _count: { _all: n } }));
      }),
    },
  };

  return { prisma };
});

import { Prisma, PipelineStage, RateSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_CURRENCY,
  dedupeCurrencyCodes,
  deleteManualRate,
  isCurrencyCode,
  listRatesForBase,
  normalizeCurrency,
  requireCurrency,
  resolveRate,
  upsertManualRate,
} from "@/lib/currency";
import {
  andWhere,
  countedWhere,
  dealFields,
  fillMissing,
  moneyTotals,
  moneyUpdate,
  pendingWhere,
  rerateAll,
} from "@/lib/conversion";

const D = Prisma.Decimal;
const OWNER = "user-A";
const OTHER = "user-B";

type Store = { entries: Record<string, unknown>[]; rates: Record<string, unknown>[]; users: Record<string, unknown>[] };
const db = (prisma as unknown as { __db: Store }).__db;
const matches = (prisma as unknown as { __matches: (row: unknown, where: unknown) => boolean }).__matches;

function rate(
  base: string,
  quote: string,
  value: string,
  source: RateSource = RateSource.FETCHED,
  userId: string = OWNER,
) {
  db.rates.push({
    id: `${userId}-${base}-${quote}-${source}`,
    userId,
    baseCurrency: base,
    quoteCurrency: quote,
    rate: new D(value),
    asOf: new Date("2026-01-01T00:00:00.000Z"),
    source,
    provider: null,
  });
}

/** Read a stored money column back as a Decimal. The mock stores whatever the
 *  code wrote, so this is also a check that something was written at all. */
function dec(value: unknown) {
  return new D(value as Prisma.Decimal.Value);
}

function deal(row: Partial<Record<string, unknown>>): Record<string, unknown> {
  const entry = {
    id: `e${db.entries.length + 1}`,
    userId: OWNER,
    pipelineId: "p1",
    contactId: "c1",
    stage: PipelineStage.ENGAGING,
    amount: null,
    currency: null,
    baseAmount: null,
    baseCurrency: null,
    fxRate: null,
    fxRateAt: null,
    ...row,
  };
  db.entries.push(entry);
  return entry;
}

beforeEach(() => {
  db.entries.length = 0;
  db.rates.length = 0;
  db.users.length = 0;
  db.users.push({ id: OWNER, reportingCurrency: "USD" }, { id: OTHER, reportingCurrency: "EUR" });
  vi.clearAllMocks();
});

describe("ISO-4217 validation", () => {
  it("rejects ZZZ, which z.string().length(3) would happily accept", () => {
    expect(normalizeCurrency("ZZZ")).toBeNull();
    expect(isCurrencyCode("ZZZ")).toBe(false);
    expect(() => requireCurrency("ZZZ")).toThrowError(/ISO-4217/);
  });

  it("rejects the placeholder codes that can never be converted", () => {
    expect(normalizeCurrency("XXX")).toBeNull();
    expect(normalizeCurrency("XTS")).toBeNull();
  });

  it("normalises real codes regardless of case and whitespace", () => {
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeCurrency("eur")).toBe("EUR");
    expect(DEFAULT_CURRENCY).toBe("USD");
  });

  it("deduplicates codes case-insensitively", () => {
    // Free-text currency means " usd " and "USD" both exist in one table.
    // Without this, a re-rate resolves the same currency twice and can freeze
    // two different rates in a single pass.
    expect(dedupeCurrencyCodes([" usd ", "USD", "Usd", "eur", "ZZZ", null])).toEqual(["USD", "EUR"]);
  });
});

describe("rate resolution", () => {
  it("prefers MANUAL over FETCHED", async () => {
    rate("USD", "EUR", "1.05", RateSource.FETCHED);
    rate("USD", "EUR", "1.20", RateSource.MANUAL);
    const resolved = await resolveRate(OWNER, "USD", "EUR");
    expect(resolved?.source).toBe(RateSource.MANUAL);
    expect(resolved?.rate.toString()).toBe("1.2");
  });

  it("refuses a rate of zero or less on write", async () => {
    await expect(upsertManualRate(OWNER, { baseCurrency: "USD", quoteCurrency: "EUR", rate: 0 })).rejects.toThrowError(
      /greater than zero/,
    );
    await expect(upsertManualRate(OWNER, { baseCurrency: "USD", quoteCurrency: "EUR", rate: -1 })).rejects.toThrowError(
      /greater than zero/,
    );
    expect(db.rates).toHaveLength(0);
  });

  it("ignores a non-positive rate on read so one bad row cannot zero a total", async () => {
    rate("USD", "EUR", "0", RateSource.MANUAL);
    expect(await resolveRate(OWNER, "USD", "EUR")).toBeNull();
  });

  it("returns null for an unknown pair rather than defaulting to 1", async () => {
    expect(await resolveRate(OWNER, "USD", "CHF")).toBeNull();
  });

  it("is exactly 1 for a currency against itself", async () => {
    const same = await resolveRate(OWNER, "USD", "USD");
    expect(same?.rate.toString()).toBe("1");
  });
});

describe("dealFields freezes the conversion", () => {
  it("converts with Decimal and stamps baseCurrency in the same write", async () => {
    rate("USD", "EUR", "1.10");
    const fields = await dealFields(OWNER, { amount: "1000.00", currency: "eur" }, "USD");
    expect(fields.baseAmount?.toFixed(2)).toBe("1100.00");
    // baseCurrency is written by every writer of baseAmount: without it, a
    // figure converted against a stale base looks identical to a correct one.
    expect(fields.baseCurrency).toBe("USD");
    expect(fields.fxRate?.toString()).toBe("1.1");
    expect(fields.fxRateAt).toBeInstanceOf(Date);
  });

  it("leaves a missing rate as NULL, never 0 and never 1", async () => {
    const fields = await dealFields(OWNER, { amount: "1000", currency: "CHF" }, "USD");
    expect(fields.baseAmount).toBeNull();
    expect(fields.baseCurrency).toBeNull();
    expect(fields.fxRate).toBeNull();
  });

  it("rejects an invented currency code instead of storing it", async () => {
    await expect(dealFields(OWNER, { amount: "10", currency: "ZZZ" }, "USD")).rejects.toThrowError(/ISO-4217/);
  });
});

describe("totals are summed from baseAmount only", () => {
  beforeEach(() => {
    rate("USD", "EUR", "1.10");
    rate("USD", "GBP", "1.25");
  });

  it("sums a mixed-currency pipeline correctly and counts what it left out", async () => {
    // 1000 USD + 1000 EUR + 500 GBP = 1000 + 1100 + 625 = 2725 USD.
    // Summing `amount` instead would give 2500: euros added to dollars.
    for (const [amount, currency] of [
      ["1000", "USD"],
      ["1000", "EUR"],
      ["500", "GBP"],
      ["900", "CHF"], // no rate: excluded and disclosed, never zeroed
    ] as const) {
      const fields = await dealFields(OWNER, { amount, currency }, "USD");
      deal({ amount: new D(amount), currency, ...fields });
    }

    const totals = await moneyTotals(OWNER, "USD");
    expect(totals.total).toBe("2725.00");
    expect(totals.counted).toBe(3);
    expect(totals.unconverted).toBe(1);
    expect(totals.unconvertedByCurrency).toEqual([{ currency: "CHF", count: 1 }]);
    expect(totals.disclosure).toMatch(/not included/);

    const naive = db.entries.reduce((acc, e) => (e.amount ? acc.plus(new D(e.amount as string)) : acc), new D(0));
    expect(naive.toFixed(2)).toBe("3400.00"); // the confident wrong number
  });

  it("keeps one tenant's deals out of another tenant's total", async () => {
    const usd = await dealFields(OWNER, { amount: "1000", currency: "USD" }, "USD");
    deal({ userId: OWNER, amount: new D("1000"), currency: "USD", ...usd });
    deal({ userId: OTHER, amount: new D("5000"), currency: "USD", ...usd });

    const mine = await moneyTotals(OWNER, "USD");
    expect(mine.total).toBe("1000.00");
    expect(mine.counted).toBe(1);
  });
});

describe("the needs-conversion filter matches NULL explicitly", () => {
  it("catches the null-baseCurrency row the obvious query cannot see", async () => {
    const nullRow = { userId: OWNER, amount: new D("900"), currency: "CHF", baseAmount: null, baseCurrency: null };
    const staleRow = {
      userId: OWNER,
      amount: new D("100"),
      currency: "EUR",
      baseAmount: new D("110"),
      baseCurrency: "EUR",
    };
    const goodRow = {
      userId: OWNER,
      amount: new D("100"),
      currency: "USD",
      baseAmount: new D("100"),
      baseCurrency: "USD",
    };

    // The naive filter. `{ not: "USD" }` never matches NULL, so the row that
    // most needs converting is invisible to it.
    const naive = { baseCurrency: { not: "USD" } };
    expect(matches(nullRow, naive)).toBe(false);

    const pending = pendingWhere("USD");
    expect(matches(nullRow, pending)).toBe(true);
    expect(matches(staleRow, pending)).toBe(true);
    expect(matches(goodRow, pending)).toBe(false);

    // And it is written as an explicit OR, not a lone `not`.
    expect(pending.OR).toEqual(
      expect.arrayContaining([{ baseCurrency: null }, { baseCurrency: { not: "USD" } }]),
    );

    expect(matches(goodRow, countedWhere("USD"))).toBe(true);
    expect(matches(nullRow, countedWhere("USD"))).toBe(false);
  });

  it("composes with AND so a caller's own OR cannot be swallowed", () => {
    // The deals list has its own OR. Spreading two objects with an OR key
    // keeps only the last one; AND keeps both.
    const callerOr = { OR: [{ stage: PipelineStage.WON }, { stage: PipelineStage.ENGAGING }] };
    const spread = { ...pendingWhere("USD"), ...callerOr };
    const composed = andWhere(pendingWhere("USD"), callerOr);

    // A perfectly converted deal. It is not pending by any reading.
    const converted = {
      amount: new D("100"),
      currency: "USD",
      baseAmount: new D("100"),
      baseCurrency: "USD",
      stage: PipelineStage.WON,
    };
    expect(spread.OR).toEqual(callerOr.OR); // the pending OR was silently dropped
    expect(matches(converted, spread)).toBe(true); // and so it is reported as needing conversion
    expect(matches(converted, composed)).toBe(false); // AND keeps both conditions

    const stillPending = { ...converted, baseAmount: null, baseCurrency: null };
    expect(matches(stillPending, composed)).toBe(true);
  });
});

describe("the frozen rate survives a read", () => {
  it("does not re-price a deal when the rate table moves", async () => {
    rate("USD", "EUR", "1.10", RateSource.MANUAL);
    const fields = await dealFields(OWNER, { amount: "1000", currency: "EUR" }, "USD");
    deal({ amount: new D("1000"), currency: "EUR", ...fields });

    // Tomorrow the rate moves.
    db.rates.length = 0;
    rate("USD", "EUR", "2.00", RateSource.MANUAL);

    const totals = await moneyTotals(OWNER, "USD");
    expect(totals.total).toBe("1100.00"); // not 2000: the quarter did not move
  });

  it("skips re-resolution entirely when neither amount nor currency changes", async () => {
    rate("USD", "EUR", "1.10", RateSource.MANUAL);
    const existing = { amount: new D("1000"), currency: "EUR" };
    const unchanged = await moneyUpdate(OWNER, existing, {}, "USD");
    expect(unchanged).toBeNull();
    expect(prisma.exchangeRate.findMany).not.toHaveBeenCalled();
  });

  it("reads the unchanged half back when only one of the pair moves", async () => {
    rate("USD", "GBP", "1.25", RateSource.MANUAL);
    const existing = { amount: new D("1000"), currency: "EUR" };
    const write = await moneyUpdate(OWNER, existing, { currency: "gbp" }, "USD");
    expect(write?.amount?.toFixed(2)).toBe("1000.00"); // amount kept, not nulled
    expect(write?.currency).toBe("GBP");
    expect(write?.baseAmount?.toFixed(2)).toBe("1250.00");
    expect(write?.baseCurrency).toBe("USD");
  });
});

describe("fillMissing", () => {
  it("never touches an already-converted deal", async () => {
    rate("USD", "EUR", "1.10", RateSource.MANUAL);
    const frozen = deal({
      amount: new D("1000"),
      currency: "EUR",
      baseAmount: new D("999.0000"), // deliberately not 1100: a stale, frozen figure
      baseCurrency: "USD",
      fxRate: new D("0.999"),
      fxRateAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const pendingRow = deal({ amount: new D("100"), currency: "EUR" });

    const result = await fillMissing(OWNER, "USD");
    expect(result.converted).toBe(1);
    expect(dec(frozen.baseAmount).toFixed(4)).toBe("999.0000");
    expect(dec(frozen.fxRate).toString()).toBe("0.999");
    expect(dec(pendingRow.baseAmount).toFixed(2)).toBe("110.00");
    expect(pendingRow.baseCurrency).toBe("USD");
  });

  it("counts what it still cannot convert instead of zeroing it", async () => {
    deal({ amount: new D("900"), currency: "CHF" });
    const result = await fillMissing(OWNER, "USD");
    expect(result.converted).toBe(0);
    expect(result.unresolved).toEqual([{ currency: "CHF", count: 1 }]);
    expect(db.entries[0].baseAmount).toBeNull();
  });

  it("only ever writes to the calling tenant's rows", async () => {
    rate("USD", "EUR", "1.10", RateSource.MANUAL);
    deal({ userId: OTHER, amount: new D("100"), currency: "EUR" });
    const result = await fillMissing(OWNER, "USD");
    expect(result.scanned).toBe(0);
    expect(db.entries[0].baseAmount).toBeNull();
    for (const call of (prisma.pipelineEntry.updateMany as unknown as { mock: { calls: [{ where: { userId?: string } }][] } }).mock.calls) {
      expect(call[0].where.userId).toBe(OWNER);
    }
  });
});

describe("rerateAll", () => {
  it("re-rates open deals and leaves closed ones booked where they were", async () => {
    rate("USD", "EUR", "1.10", RateSource.MANUAL);
    rate("GBP", "EUR", "0.85", RateSource.MANUAL);

    const open = deal({
      stage: PipelineStage.ENGAGING,
      amount: new D("1000"),
      currency: "EUR",
      baseAmount: new D("1100"),
      baseCurrency: "USD",
      fxRate: new D("1.1"),
    });
    const won = deal({
      stage: PipelineStage.WON,
      amount: new D("1000"),
      currency: "EUR",
      baseAmount: new D("1100"),
      baseCurrency: "USD",
      fxRate: new D("1.1"),
    });

    const result = await rerateAll(OWNER, "GBP");
    expect(result.converted).toBe(1);
    expect(dec(open.baseAmount).toFixed(2)).toBe("850.00");
    expect(open.baseCurrency).toBe("GBP");
    // Booked revenue is history. It keeps its original base, which means it
    // drops out of the new base's total and is COUNTED as unconverted.
    expect(dec(won.baseAmount).toFixed(2)).toBe("1100.00");
    expect(won.baseCurrency).toBe("USD");
    expect(result.closedLeftAlone).toBe(1);

    const totals = await moneyTotals(OWNER, "GBP");
    expect(totals.total).toBe("850.00");
    expect(totals.unconverted).toBe(1);
  });

  it("resolves each currency once however it was typed", async () => {
    rate("EUR", "USD", "0.90", RateSource.MANUAL);
    deal({ amount: new D("100"), currency: " usd " });
    deal({ amount: new D("100"), currency: "USD" });
    deal({ amount: new D("100"), currency: "Usd" });

    await rerateAll(OWNER, "EUR");
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledTimes(1);
    for (const row of db.entries) {
      expect(dec(row.baseAmount).toFixed(2)).toBe("90.00");
      expect(row.baseCurrency).toBe("EUR");
    }
  });

  it("does not reach another tenant's deals", async () => {
    rate("EUR", "USD", "0.90", RateSource.MANUAL);
    const theirs = deal({ userId: OTHER, amount: new D("100"), currency: "USD" });
    const result = await rerateAll(OWNER, "EUR");
    expect(result.scanned).toBe(0);
    expect(theirs.baseAmount).toBeNull();
  });
});

describe("rates are per tenant", () => {
  // The bug this closes: with a single global rate row per pair, one operator
  // correcting their EUR rate silently restated every other operator's
  // pipeline, and a delete removed everyone's rate.

  it("one tenant's MANUAL rate does not convert another tenant's deal", async () => {
    rate("USD", "EUR", "1.10", RateSource.MANUAL, OWNER);

    const mine = await dealFields(OWNER, { amount: "1000", currency: "EUR" }, "USD");
    expect(mine.baseAmount?.toFixed(2)).toBe("1100.00");

    // The other tenant has no rate of their own, so the deal is disclosed as
    // unconvertible rather than borrowing a number that is not theirs.
    const theirs = await dealFields(OTHER, { amount: "1000", currency: "EUR" }, "USD");
    expect(theirs.baseAmount).toBeNull();
    expect(theirs.baseCurrency).toBeNull();
    expect(theirs.fxRate).toBeNull();
  });

  it("each tenant's totals are built from that tenant's own rate", async () => {
    rate("USD", "EUR", "1.10", RateSource.MANUAL, OWNER);
    rate("USD", "EUR", "3.00", RateSource.MANUAL, OTHER);

    deal({ userId: OWNER, amount: new D("1000"), currency: "EUR" });
    deal({ userId: OTHER, amount: new D("1000"), currency: "EUR" });

    await fillMissing(OWNER, "USD");
    await fillMissing(OTHER, "USD");

    expect((await moneyTotals(OWNER, "USD")).total).toBe("1100.00");
    expect((await moneyTotals(OTHER, "USD")).total).toBe("3000.00");
  });

  it("setting a rate never overwrites another tenant's rate for the same pair", async () => {
    await upsertManualRate(OWNER, { baseCurrency: "USD", quoteCurrency: "EUR", rate: "1.10" });
    await upsertManualRate(OTHER, { baseCurrency: "USD", quoteCurrency: "EUR", rate: "3.00" });

    expect(db.rates).toHaveLength(2);
    expect(dec((await resolveRate(OWNER, "USD", "EUR"))?.rate).toString()).toBe("1.1");
    expect(dec((await resolveRate(OTHER, "USD", "EUR"))?.rate).toString()).toBe("3");
  });

  it("rejects a cross-tenant rate delete and leaves the row standing", async () => {
    await upsertManualRate(OWNER, { baseCurrency: "USD", quoteCurrency: "EUR", rate: "1.10" });

    await expect(deleteManualRate(OTHER, "USD", "EUR")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(db.rates).toHaveLength(1);
    expect(dec((await resolveRate(OWNER, "USD", "EUR"))?.rate).toString()).toBe("1.1");
  });

  it("lists only the calling tenant's rates", async () => {
    rate("USD", "EUR", "1.10", RateSource.MANUAL, OWNER);
    rate("USD", "GBP", "1.25", RateSource.MANUAL, OTHER);

    const mine = await listRatesForBase(OWNER, "USD");
    expect(mine).toHaveLength(1);
    expect(mine[0].quoteCurrency).toBe("EUR");
  });
});
