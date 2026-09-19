import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { decideTurn } from "@/lib/jev";

const schema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`jev-decide:${user.id}`, 40, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Say what you want to do." }, { status: 400 });

    const decision = await decideTurn({ message: parsed.data.message });
    return NextResponse.json(decision);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/jev/decide", e);
    return NextResponse.json({ error: "Jev decide failed." }, { status: 500 });
  }
}
