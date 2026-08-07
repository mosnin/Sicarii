// POST /api/phone-numbers/purchase - buy a number and wire it, or own nothing.
//
// HUMAN ONLY. This spends real recurring money on a telecom asset under a
// regulatory identity, so it lives behind a Clerk session and is deliberately
// NOT exposed as an agent tool over MCP.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { provisionNumber } from "@/lib/telephony/provisioning";

const purchaseSchema = z.object({
  e164: z.string().trim().min(8).max(20),
  countryCode: z.string().trim().length(2),
  areaCode: z.string().trim().max(6).optional(),
  numberType: z.enum(["local", "toll_free", "mobile"]).optional(),
  monthlyCostCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  spamScore: z.number().min(0).max(1).nullable().optional(),
  provider: z.enum(["livekit", "twilio", "telnyx", "LIVEKIT", "TWILIO", "TELNYX"]).optional(),
  // Regulatory identity. Required in many regions, and when a SaaS resells
  // numbers it is often the END CUSTOMER's identity the carrier demands.
  bundleSid: z.string().trim().max(100).optional(),
  addressSid: z.string().trim().max(100).optional(),
  identitySid: z.string().trim().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    // Buying is slow, irreversible and costs money. A tight limit here is the
    // difference between a fat finger and a phone bill.
    const rate = await checkRateLimit(`phone-purchase:${user.id}`, 5, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many purchase attempts. Wait a minute." }, { status: 429 });
    }

    const parsed = purchaseSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", detail: parsed.error.issues }, { status: 400 });
    }

    const number = await provisionNumber(user.id, {
      ...parsed.data,
      provider: parsed.data.provider ?? null,
    });
    return NextResponse.json({ number }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/phone-numbers/purchase", e);
    return NextResponse.json({ error: "Failed to buy that number" }, { status: 500 });
  }
}
