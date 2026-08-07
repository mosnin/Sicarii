import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import {
  baseCurrencyOf,
  deleteManualRate,
  listRatesForBase,
  normalizeCurrency,
  upsertManualRate,
} from "@/lib/currency";
import { fillMissing, moneyTotals } from "@/lib/conversion";

const currencySchema = z
  .string()
  .trim()
  .max(10)
  .transform((v) => normalizeCurrency(v))
  .refine((v): v is string => v !== null, "Must be a valid ISO-4217 currency code");

// GET /api/currency/rates - every rate that can convert into this user's
// reporting currency, whichever direction it is stored in.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const base = baseCurrencyOf(user);
    const rates = await listRatesForBase(user.id, base);
    return NextResponse.json({
      base,
      rates: rates.map((r) => ({
        id: r.id,
        baseCurrency: r.baseCurrency,
        quoteCurrency: r.quoteCurrency,
        rate: r.rate.toString(),
        asOf: r.asOf.toISOString(),
        source: r.source,
        provider: r.provider,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/currency/rates", e);
    return NextResponse.json({ error: "Failed to load rates" }, { status: 500 });
  }
}

const postSchema = z.object({
  // Defaults to the user's reporting currency: the rate they almost always
  // want is "one unit of X is worth this much in what I report in".
  baseCurrency: currencySchema.optional(),
  quoteCurrency: currencySchema,
  rate: z.union([z.number(), z.string().trim().max(40)]),
  asOf: z.string().datetime().optional(),
  note: z.string().trim().max(120).optional(),
});

// POST /api/currency/rates - set a MANUAL rate.
//
// MANUAL always beats FETCHED at resolve time, which is what makes a
// rate-fetching integration optional: with no provider wired up at all, a
// manual rate is a complete answer. A rate of zero or less is refused, since
// it would silently zero or invert a real deal.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const limit = await checkRateLimit(`currency-rate:${user.id}`, 60, 60_000);
    if (!limit.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid rate" }, { status: 400 });

    const base = parsed.data.baseCurrency ?? baseCurrencyOf(user);
    const saved = await upsertManualRate(user.id, {
      baseCurrency: base,
      quoteCurrency: parsed.data.quoteCurrency,
      rate: parsed.data.rate,
      asOf: parsed.data.asOf ? new Date(parsed.data.asOf) : undefined,
      note: parsed.data.note,
    });

    // A new rate does not reach back and re-price deals that were already
    // converted (their rate is frozen), but it does let the deals that had no
    // rate at all finally join the total.
    const userBase = baseCurrencyOf(user);
    const filled = await fillMissing(user.id, userBase);
    const totals = await moneyTotals(user.id, userBase);

    return NextResponse.json({
      ok: true,
      rate: {
        id: saved.id,
        baseCurrency: saved.baseCurrency,
        quoteCurrency: saved.quoteCurrency,
        rate: saved.rate.toString(),
        asOf: saved.asOf.toISOString(),
        source: saved.source,
      },
      filled,
      totals,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/currency/rates", e);
    return NextResponse.json({ error: "Failed to save rate" }, { status: 500 });
  }
}

// DELETE /api/currency/rates?base=USD&quote=EUR - drop a manual rate. Deals
// already converted against it keep their frozen figures: the conversion
// happened, and deleting the rate does not un-happen it.
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const limit = await checkRateLimit(`currency-rate:${user.id}`, 60, 60_000);
    if (!limit.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const url = new URL(req.url);
    const base = url.searchParams.get("base") ?? baseCurrencyOf(user);
    const quote = url.searchParams.get("quote") ?? "";
    await deleteManualRate(user.id, base, quote);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/currency/rates", e);
    return NextResponse.json({ error: "Failed to delete rate" }, { status: 500 });
  }
}
