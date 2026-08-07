// Money, part 1: what a currency code is and what a rate is.
//
// Everything in here exists because the naive version of it is silently
// wrong. `z.string().length(3)` accepts "ZZZ"; free-text currency means
// " usd " and "USD" both reach the database; a rate of 0 turns a real deal
// into a zero without erroring. The rules are written out in full in
// docs/engineering/currency.md.
//
// Arithmetic is Prisma.Decimal (decimal.js) end to end. Money never touches a
// JS number: 0.1 + 0.2 is not 0.3, and a forecast that is off by a cent is a
// forecast nobody trusts.

import { Prisma, RateSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

/** Fallback reporting currency for a user who has never set one. */
export const DEFAULT_CURRENCY = "USD";

// The active ISO-4217 alphabetic codes. This is the whole point of the module:
// a real list, not a length check. Codes withdrawn by the maintenance agency
// are left out, so a deal cannot be booked in a currency that no longer
// exists.
//
// XXX ("no currency") and XTS ("reserved for testing") are deliberately
// EXCLUDED even though ISO defines them: they are valid codes for a
// transaction that has no currency, and accepting them here would put a row
// in the pipeline that no rate can ever convert.
const ISO_4217 = new Set([
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BOV",
  "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHE", "CHF",
  "CHW", "CLF", "CLP", "CNY", "COP", "COU", "CRC", "CUP", "CVE", "CZK",
  "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP",
  "GBP", "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL",
  "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD",
  "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT",
  "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD",
  "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MXV", "MYR",
  "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN",
  "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF",
  "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD",
  "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP",
  "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "USN", "UYI", "UYU",
  "UYW", "UZS", "VED", "VES", "VND", "VUV", "WST", "XAF", "XAG", "XAU",
  "XBA", "XBB", "XBC", "XBD", "XCD", "XCG", "XDR", "XOF", "XPD", "XPF",
  "XPT", "XSU", "XUA", "YER", "ZAR", "ZMW", "ZWG",
]);

/** The currencies offered in the settings picker. The validator accepts every
 *  ISO code; this is just the short list a human scrolls. */
export const COMMON_CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "SEK", "NOK", "DKK",
  "SGD", "HKD", "NZD", "INR", "BRL", "MXN", "ZAR", "AED", "PLN", "ILS",
] as const;

/** True when `code` is an active ISO-4217 alphabetic code, ignoring case and
 *  surrounding whitespace. */
export function isCurrencyCode(code: unknown): boolean {
  return normalizeCurrency(code) !== null;
}

/**
 * Canonical form of a currency code, or null when it is not a real one.
 * Free-text currency is the norm (CSV imports, agents, humans), so " usd "
 * and "USD" must collapse to the same code before anything is keyed on it.
 */
export function normalizeCurrency(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) return null;
  return ISO_4217.has(upper) ? upper : null;
}

/** normalizeCurrency, but a bad code is a 400 rather than a null that some
 *  caller downstream treats as "no currency given". */
export function requireCurrency(code: unknown, label = "currency"): string {
  const normalized = normalizeCurrency(code);
  if (!normalized) {
    throw new OpError(
      `${label} must be a valid ISO-4217 code (for example USD, EUR, GBP). Got: ${String(code)}`,
      400,
    );
  }
  return normalized;
}

/**
 * Distinct, canonical currency codes from a messy list. Case-insensitive by
 * construction (everything is normalized first), so re-rating resolves the
 * rate for " usd " and "USD" once instead of twice, and cannot end up with
 * two different frozen rates for the same currency in one pass.
 * Codes that are not real currencies are dropped: they have no rate to fetch.
 */
export function dedupeCurrencyCodes(codes: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  for (const raw of codes) {
    const code = normalizeCurrency(raw);
    if (code) seen.add(code);
  }
  return [...seen];
}

/** Human-facing money. Falls back to "CODE 1234.56" if the runtime's ICU data
 *  does not know the currency, which is better than throwing inside a render. */
export function formatMoney(
  amount: Decimal | string | number | null | undefined,
  currency: string,
  locale = "en-US",
): string {
  if (amount === null || amount === undefined) return "";
  const value = new Decimal(amount as Prisma.Decimal.Value);
  const code = normalizeCurrency(currency) ?? currency;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      // toNumber() is for DISPLAY only. Every stored and summed figure stays a
      // Decimal; this is the one place a float is acceptable because the
      // output is a string a human reads, not a value anything is derived from.
      maximumFractionDigits: 2,
    }).format(value.toNumber());
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}

// ── Rates ──────────────────────────────────────────────────────────────────
// A row (baseCurrency = B, quoteCurrency = Q, rate = r) means: one unit of Q
// is worth r units of B. So baseAmount = amount * r, where B is the user's
// reporting currency and Q is what the customer pays in. Storing it the other
// way round would make every conversion a division and every reading of the
// table ambiguous, which is how sign-flipped FX bugs happen.

export interface ResolvedRate {
  /** Multiply a `quote`-denominated amount by this to get `base`. */
  rate: Decimal;
  asOf: Date;
  source: RateSource;
  provider: string | null;
  /** True when the stored row was base<-quote inverted to get here. */
  inverted: boolean;
}

/** A rate must be strictly positive. Zero silently zeroes a real deal; a
 *  negative rate produces a negative forecast. Both are refused at the door
 *  AND ignored on read, so one bad row cannot poison a total. */
export function isUsableRate(rate: Decimal | null | undefined): boolean {
  return rate != null && new Decimal(rate).gt(0);
}

// MANUAL beats FETCHED, always. The operator's number is the one they will
// defend in a board meeting, and it is what makes a rate-fetching integration
// optional rather than required: with no provider wired up at all, a manual
// rate is a complete answer.
function bestRow<T extends { source: RateSource; rate: Decimal }>(rows: T[]): T | null {
  const usable = rows.filter((r) => isUsableRate(r.rate));
  return (
    usable.find((r) => r.source === RateSource.MANUAL) ??
    usable.find((r) => r.source === RateSource.FETCHED) ??
    null
  );
}

/**
 * The rate that converts `quote` into `base` FOR THIS TENANT, or null when
 * there is not one.
 *
 * Null is the whole point: a missing rate is disclosed, never defaulted to 1
 * (which quietly says a euro is a dollar) and never defaulted to 0 (which
 * quietly deletes the deal). Callers leave baseAmount null and COUNT the row
 * so the UI can say "3 deals in CHF are not included".
 *
 * Preference order: direct MANUAL, direct FETCHED, then the reciprocal of an
 * inverse row (MANUAL before FETCHED). The inverse fallback means an operator
 * who entered USD<-EUR does not have to enter EUR<-USD by hand when they
 * switch their reporting currency.
 */
export async function resolveRate(
  userId: string,
  base: string,
  quote: string,
): Promise<ResolvedRate | null> {
  const b = normalizeCurrency(base);
  const q = normalizeCurrency(quote);
  if (!b || !q) return null;

  // Identity. One dollar is one dollar; this needs no row and must never be a
  // "missing rate" that drops a same-currency deal out of its own total.
  if (b === q) {
    return { rate: new Decimal(1), asOf: new Date(), source: RateSource.MANUAL, provider: "identity", inverted: false };
  }

  const rows = await prisma.exchangeRate.findMany({
    // userId first and always: a rate is one operator's judgement about their
    // own book. An unscoped read here would let one tenant's correction
    // silently restate every other tenant's pipeline.
    where: {
      userId,
      OR: [
        { baseCurrency: b, quoteCurrency: q },
        { baseCurrency: q, quoteCurrency: b },
      ],
    },
  });

  const direct = bestRow(rows.filter((r) => r.baseCurrency === b && r.quoteCurrency === q));
  if (direct) {
    return {
      rate: new Decimal(direct.rate),
      asOf: direct.asOf,
      source: direct.source,
      provider: direct.provider,
      inverted: false,
    };
  }

  const inverse = bestRow(rows.filter((r) => r.baseCurrency === q && r.quoteCurrency === b));
  if (inverse) {
    return {
      // 10 dp matches the fxRate column's scale, so what we freeze is what the
      // database can actually hold.
      rate: new Decimal(1).div(new Decimal(inverse.rate)).toDecimalPlaces(10),
      asOf: inverse.asOf,
      source: inverse.source,
      provider: inverse.provider,
      inverted: true,
    };
  }

  return null;
}

/** resolveRate for several quote currencies at once. Codes are deduplicated
 *  case-insensitively first, so a re-rate pass resolves each currency once. */
export async function resolveRates(
  userId: string,
  base: string,
  quotes: Iterable<unknown>,
): Promise<Map<string, ResolvedRate | null>> {
  const out = new Map<string, ResolvedRate | null>();
  for (const code of dedupeCurrencyCodes(quotes)) {
    out.set(code, await resolveRate(userId, base, code));
  }
  return out;
}

/**
 * Create or replace this tenant's MANUAL rate for a pair. The unique key is
 * the 4-tuple [userId, baseCurrency, quoteCurrency, source], so one operator
 * setting their EUR rate can never touch another operator's totals.
 */
export async function upsertManualRate(
  userId: string,
  input: {
    baseCurrency: string;
    quoteCurrency: string;
    rate: Decimal | string | number;
    asOf?: Date;
    note?: string;
  },
) {
  const base = requireCurrency(input.baseCurrency, "baseCurrency");
  const quote = requireCurrency(input.quoteCurrency, "quoteCurrency");
  if (base === quote) throw new OpError("A currency is always 1:1 with itself, no rate needed.", 400);

  let rate: Decimal;
  try {
    rate = new Decimal(input.rate as Prisma.Decimal.Value);
  } catch {
    throw new OpError("rate must be a number.", 400);
  }
  if (!rate.isFinite() || !isUsableRate(rate)) {
    throw new OpError("rate must be greater than zero.", 400);
  }

  const data = {
    rate: rate.toDecimalPlaces(10),
    asOf: input.asOf ?? new Date(),
    provider: input.note ?? "manual",
  };
  return prisma.exchangeRate.upsert({
    where: {
      userId_baseCurrency_quoteCurrency_source: {
        userId,
        baseCurrency: base,
        quoteCurrency: quote,
        source: RateSource.MANUAL,
      },
    },
    create: { userId, baseCurrency: base, quoteCurrency: quote, source: RateSource.MANUAL, ...data },
    update: data,
  });
}

/** Remove this tenant's MANUAL rate. A FETCHED row for the same pair (if any
 *  integration ever writes one) is left alone and takes over on the next
 *  resolve. The delete carries userId, so another tenant's rate for the same
 *  pair is a 404, not a silent cross-account delete. */
export async function deleteManualRate(userId: string, baseCurrency: string, quoteCurrency: string) {
  const base = requireCurrency(baseCurrency, "baseCurrency");
  const quote = requireCurrency(quoteCurrency, "quoteCurrency");
  const res = await prisma.exchangeRate.deleteMany({
    where: { userId, baseCurrency: base, quoteCurrency: quote, source: RateSource.MANUAL },
  });
  if (res.count === 0) throw new OpError("No manual rate for that pair.", 404);
  return res;
}

/** Every rate that can convert into `base`, newest first. Used by the settings
 *  surface so the operator can see what their numbers are actually built on. */
export async function listRatesForBase(userId: string, base: string) {
  const b = requireCurrency(base, "base");
  return prisma.exchangeRate.findMany({
    where: { userId, OR: [{ baseCurrency: b }, { quoteCurrency: b }] },
    orderBy: [{ quoteCurrency: "asc" }, { source: "asc" }],
  });
}

/** The reporting currency of an already-loaded user row. Per user, never a
 *  global constant: two tenants report in two different currencies and every
 *  aggregate has to be computed against the right one. */
export function baseCurrencyOf(user: { reportingCurrency?: string | null } | null | undefined): string {
  return normalizeCurrency(user?.reportingCurrency) ?? DEFAULT_CURRENCY;
}

/** The user's reporting currency: the denomination of every baseAmount, every
 *  total and every sort. Per user, never a global constant. */
export async function reportingCurrencyOf(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { reportingCurrency: true },
  });
  if (!user) throw new OpError("User not found", 404);
  return normalizeCurrency(user.reportingCurrency) ?? DEFAULT_CURRENCY;
}
