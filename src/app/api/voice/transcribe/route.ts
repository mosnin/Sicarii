import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { isOpenAIVoiceConfigured, transcribeAudio } from "@/lib/jev";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`voice-transcribe:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isOpenAIVoiceConfigured()) {
      return NextResponse.json({ error: "Voice transcription needs OPENAI_API_KEY." }, { status: 501 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Attach an audio file." }, { status: 400 });
    }
    if (file.size > 8_000_000) {
      return NextResponse.json({ error: "Audio is too large (8MB max)." }, { status: 400 });
    }

    const text = await transcribeAudio(file);
    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/voice/transcribe", e);
    return NextResponse.json({ error: "Transcription failed." }, { status: 500 });
  }
}
