import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { isJevConfigured, redactEvaluateState, tryEvaluate, type Json, type QuestionMap } from "@/lib/jev";

const schema = z.object({
  state: z.unknown(),
  questions: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`jev-evaluate:${user.id}`, 40, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isJevConfigured()) {
      return NextResponse.json(
        { error: "Jev is not configured. Set TYPESAFE_API_KEY, AI_GATEWAY_API_KEY, or OPENROUTER_API_KEY." },
        { status: 501 },
      );
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const result = await tryEvaluate({
      state: redactEvaluateState((parsed.data.state ?? {}) as Json),
      questions: parsed.data.questions as QuestionMap,
      onFailure: "fail-closed",
    });
    if (!result) return NextResponse.json({ error: "Jev evaluate failed." }, { status: 502 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/jev/evaluate", e);
    return NextResponse.json({ error: "Jev evaluate failed." }, { status: 500 });
  }
}
