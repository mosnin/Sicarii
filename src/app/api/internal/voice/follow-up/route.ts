// Worker-facing: schedule a follow-up promised during a call, as an AgentTask
// whose reason is shown to the operator.
import { z } from "zod";
import { OpError } from "@/lib/op-error";
import { requireInternalAuth, scheduleVoiceFollowUp } from "@/lib/internal-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  tenantId: z.string().min(1),
  callId: z.string().nullish(),
  roomName: z.string().min(1).max(500),
  contactId: z.string().min(1),
  dueAt: z.string().min(1),
  reason: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  try {
    requireInternalAuth(req);
    const body = Body.parse(await req.json());
    const taskId = await scheduleVoiceFollowUp(body);
    return Response.json({ ok: true, taskId });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues }, { status: 400 });
    if (e instanceof OpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[internal/voice/follow-up]", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
