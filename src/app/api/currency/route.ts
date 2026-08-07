import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import {
  COMMON_CURRENCIES,
  baseCurrencyOf,
  listRatesForBase,
  normalizeCurrency,
} from "@/lib/currency";
import { currenciesInUse, fillMissing, moneyTotals, rerateAll } from "@/lib/conversion";

// GET /api/currency - the reporting currency this user's totals are in, the
// rates those totals rest on, and what is currently falling out of them.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const base = baseCurrencyOf(user);
    const [rates, inUse, totals] = await Promise.all([
      listRatesForBase(user.id, base),
      currenciesInUse(user.id),
      moneyTotals(user.id, base),
    ]);

    return NextResponse.json({
      reportingCurrency: base,
      common: COMMON_CURRENCIES,
      currenciesInUse: inUse,
      // Which of the currencies actually on deals have no way into the base.
      missingRatesFor: inUse.filter(
        (code) =>
          code !== base &&
          !rates.some(
            (r) =>
              (r.baseCurrency === base && r.quoteCurrency === code) ||
              (r.baseCurrency === code && r.quoteCurrency === base),
          ),
      ),
      rates: rates.map((r) => ({
        id: r.id,
        baseCurrency: r.baseCurrency,
        quoteCurrency: r.quoteCurrency,
        rate: r.rate.toString(),
        asOf: r.asOf.toISOString(),
        source: r.source,
        provider: r.provider,
      })),
      totals,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/currency", e);
    return NextResponse.json({ error: "Failed to load currency settings" }, { status: 500 });
  }
}

const patchSchema = z.object({
  reportingCurrency: z
    .string()
    .trim()
    .max(10)
    .transform((v) => normalizeCurrency(v))
    .refine((v): v is string => v !== null, "Must be a valid ISO-4217 currency code"),
});

// PATCH /api/currency - change the reporting currency.
//
// This is the one operation allowed to overwrite a frozen rate, and it only
// touches OPEN deals: a won deal was booked at the rate that was true when it
// closed, and restating it would make last quarter move. Closed deals keep
// their original base, so they drop out of the new base's totals and are
// reported in the `unconverted` count instead of being quietly added up in
// the wrong denomination.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const limit = await checkRateLimit(`currency-base:${user.id}`, 10, 60_000);
    if (!limit.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid reporting currency" }, { status: 400 });
    }
    const base = parsed.data.reportingCurrency;
    const previous = baseCurrencyOf(user);

    await prisma.user.update({ where: { id: user.id }, data: { reportingCurrency: base } });

    // Re-rate open deals into the new base, then pick up anything that had no
    // conversion at all. Both are scoped to this user's rows.
    const rerated = base === previous ? null : await rerateAll(user.id, base);
    const filled = await fillMissing(user.id, base);
    const totals = await moneyTotals(user.id, base);

    return NextResponse.json({
      ok: true,
      reportingCurrency: base,
      previous,
      rerated,
      filled,
      totals,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/currency", e);
    return NextResponse.json({ error: "Failed to change reporting currency" }, { status: 500 });
  }
}
