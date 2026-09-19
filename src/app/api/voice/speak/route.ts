import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { isOpenAIVoiceConfigured, speakText } from "@/lib/jev";

const schema = z.object({
  text: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`voice-speak:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isOpenAIVoiceConfigured()) {
      return NextResponse.json({ error: "Voice speech needs OPENAI_API_KEY." }, { status: 501 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Provide text to speak." }, { status: 400 });

    const audio = await speakText(parsed.data.text);
    return new NextResponse(audio, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/voice/speak", e);
    return NextResponse.json({ error: "Speech failed." }, { status: 500 });
  }
}
