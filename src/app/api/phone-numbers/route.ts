// GET /api/phone-numbers          - the tenant's numbers
// GET /api/phone-numbers?country= - search what is available to buy
//
// Clerk-authenticated, ownership-scoped through the ops layer. Search is rate
// limited because it hits a carrier on every call.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { defaultProviderName, supportedCountries } from "@/lib/telephony/provider";
import { listNumbers, maxNumbersPerTenant, searchAvailableNumbers } from "@/lib/telephony/provisioning";

const searchSchema = z.object({
  country: z.string().trim().length(2),
  areaCode: z.string().trim().max(6).optional(),
  contains: z.string().trim().max(20).optional(),
  numberType: z.enum(["local", "toll_free", "mobile"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");

    if (!country) {
      const numbers = await listNumbers(user.id);
      return NextResponse.json({
        numbers,
        limit: maxNumbersPerTenant(),
        provider: defaultProviderName(),
        countries: supportedCountries(defaultProviderName()),
      });
    }

    const rate = await checkRateLimit(`phone-search:${user.id}`, 30, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many searches. Wait a moment and try again." }, { status: 429 });
    }

    const parsed = searchSchema.safeParse({
      country,
      areaCode: searchParams.get("areaCode") ?? undefined,
      contains: searchParams.get("contains") ?? undefined,
      numberType: searchParams.get("numberType") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid search", detail: parsed.error.issues }, { status: 400 });
    }

    const result = await searchAvailableNumbers(user.id, {
      countryCode: parsed.data.country,
      areaCode: parsed.data.areaCode,
      contains: parsed.data.contains,
      numberType: parsed.data.numberType,
      limit: parsed.data.limit,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/phone-numbers", e);
    return NextResponse.json({ error: "Failed to load phone numbers" }, { status: 500 });
  }
}
