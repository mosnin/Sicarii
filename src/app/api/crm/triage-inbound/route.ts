import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { isJevConfigured, triageInbound } from "@/lib/jev";

const schema = z.object({
  text: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`triage:${user.id}`, 40, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isJevConfigured()) {
      return NextResponse.json({ error: "Triage needs a Jev key." }, { status: 501 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const result = await triageInbound(parsed.data.text);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/crm/triage-inbound", e);
    return NextResponse.json({ error: "Triage failed." }, { status: 500 });
  }
}
