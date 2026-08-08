// Worker-facing: bootstrap one call session. See src/lib/internal-voice.ts
// for the contract rules (shared-secret auth, idempotent by room name).
import { z } from "zod";
import { OpError } from "@/lib/op-error";
import { requireInternalAuth, bootstrapVoiceSession } from "@/lib/internal-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  tenantId: z.string().min(1),
  callId: z.string().nullish(),
  roomName: z.string().min(1).max(500),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  phoneNumber: z.string().max(32).nullish(),
  fromNumber: z.string().max(32),
  crmContactId: z.string().nullish(),
  purpose: z.string().max(2000).nullish(),
  agentName: z.string().max(200),
});

export async function POST(req: Request) {
  try {
    requireInternalAuth(req);
    const body = Body.parse(await req.json());
    return Response.json(await bootstrapVoiceSession(body));
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues }, { status: 400 });
    if (e instanceof OpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[internal/voice/session]", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
