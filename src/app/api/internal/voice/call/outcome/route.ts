// Worker-facing: the conversation's business outcome, written as an Activity.
// do_not_call also lands the person on the suppression list (scope ALL).
import { z } from "zod";
import { OpError } from "@/lib/op-error";
import { requireInternalAuth, recordCallOutcome, CALL_OUTCOMES } from "@/lib/internal-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  tenantId: z.string().min(1),
  callId: z.string().nullish(),
  roomName: z.string().min(1).max(500),
  contactId: z.string().nullish(),
  outcome: z.enum(CALL_OUTCOMES),
  summary: z.string().min(1).max(5000),
});

export async function POST(req: Request) {
  try {
    requireInternalAuth(req);
    const body = Body.parse(await req.json());
    const activityId = await recordCallOutcome(body);
    return Response.json({ ok: true, activityId });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues }, { status: 400 });
    if (e instanceof OpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[internal/voice/call/outcome]", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
