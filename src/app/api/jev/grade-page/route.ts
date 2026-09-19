import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { gradePage, isJevConfigured } from "@/lib/jev";

const schema = z.object({
  page: z.string().min(1).max(20_000),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`jev-grade-page:${user.id}`, 40, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isJevConfigured()) {
      return NextResponse.json({ error: "Page grade needs a Jev key." }, { status: 501 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const grade = await gradePage(parsed.data.page);
    return NextResponse.json({ grade });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/jev/grade-page", e);
    return NextResponse.json({ error: "Page grade failed." }, { status: 500 });
  }
}
