// Worker-facing: recent activity on one contact, newest first, capped.
import { z } from "zod";
import { OpError } from "@/lib/op-error";
import { requireInternalAuth, contactHistory } from "@/lib/internal-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireInternalAuth(req);
    const url = new URL(req.url);
    const tenantId = z.string().min(1).parse(url.searchParams.get("tenantId"));
    const contactId = z.string().min(1).parse(url.searchParams.get("contactId"));
    const limit = Number(url.searchParams.get("limit") ?? 10);
    return Response.json({ items: await contactHistory(tenantId, contactId, limit) });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues }, { status: 400 });
    if (e instanceof OpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[internal/voice/contact/history]", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
