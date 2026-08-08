// Worker-facing: contact lookup by id or exact phone, inside one tenant.
import { z } from "zod";
import { OpError } from "@/lib/op-error";
import { requireInternalAuth, lookupContact } from "@/lib/internal-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireInternalAuth(req);
    const url = new URL(req.url);
    const tenantId = z.string().min(1).parse(url.searchParams.get("tenantId"));
    const contact = await lookupContact(tenantId, {
      contactId: url.searchParams.get("contactId"),
      phone: url.searchParams.get("phone"),
    });
    return Response.json({ contact });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues }, { status: 400 });
    if (e instanceof OpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[internal/voice/contact]", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
