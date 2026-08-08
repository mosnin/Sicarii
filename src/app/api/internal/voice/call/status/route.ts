// Worker-facing: mid-call status transition (ringing, answered, ...).
// tenantId is null only when the worker refused a call with unreadable
// metadata; the room name resolves the row on its own then.
import { z } from "zod";
import { OpError } from "@/lib/op-error";
import { requireInternalAuth, updateCallStatus } from "@/lib/internal-voice";

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
});

export async function POST(req: Request) {
  try {
    requireInternalAuth(req);
    const body = Body.parse(await req.json());
    return Response.json({ ok: await updateCallStatus(body) });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues }, { status: 400 });
    if (e instanceof OpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[internal/voice/call/status]", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
