// Worker-facing: the final write for one call - status, timings, transcript,
// per-model usage. Metering deliberately does NOT happen here; the LiveKit
// room_finished webhook is billing's single author.
import { z } from "zod";
import { OpError } from "@/lib/op-error";
import { requireInternalAuth, completeCall } from "@/lib/internal-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Status = z.enum(["QUEUED", "RINGING", "ANSWERED", "COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "VOICEMAIL"]);
const Body = z.object({
  tenantId: z.string().min(1).nullable(),
  callId: z.string().nullish(),
  roomName: z.string().min(1).max(500),
  status: Status,
  sipStatusCode: z.number().int().nullish(),
  sipStatus: z.string().max(200).nullish(),
  startedAt: z.string().nullish(),
  answeredAt: z.string().nullish(),
  endedAt: z.string().min(1),
  durationSeconds: z.number().int().min(0).nullish(),
  transcript: z.unknown().optional(),
  modelUsage: z.unknown().optional(),
  systemPrompt: z.string().max(20000).nullish(),
  error: z.string().max(2000).nullish(),
});

export async function POST(req: Request) {
  try {
    requireInternalAuth(req);
    const body = Body.parse(await req.json());
    return Response.json({ ok: await completeCall(body) });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues }, { status: 400 });
    if (e instanceof OpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[internal/voice/call/complete]", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
