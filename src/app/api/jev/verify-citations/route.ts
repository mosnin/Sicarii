import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { isJevConfigured, verifyCitations } from "@/lib/jev";

const schema = z.object({
  claims: z
    .array(
      z.object({
        claim: z.string().max(400),
        quote: z.string().max(600),
        url: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`jev-citations:${user.id}`, 40, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isJevConfigured()) {
      return NextResponse.json({ error: "Citation verify needs a Jev key." }, { status: 501 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const verdicts = await verifyCitations(parsed.data.claims);
    return NextResponse.json({ verdicts });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/jev/verify-citations", e);
    return NextResponse.json({ error: "Citation verify failed." }, { status: 500 });
  }
}
