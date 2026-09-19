import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { createRealtimeSession, isOpenAIVoiceConfigured } from "@/lib/jev";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`voice-realtime:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isOpenAIVoiceConfigured()) {
      return NextResponse.json({ error: "Realtime voice needs OPENAI_API_KEY." }, { status: 501 });
    }

    const session = await createRealtimeSession();
    return NextResponse.json(session);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/voice/realtime", e);
    return NextResponse.json({ error: "Realtime session failed." }, { status: 500 });
  }
}
