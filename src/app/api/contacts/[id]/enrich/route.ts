import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { enrichContactField, type Field } from "@/lib/contact-enrich";

// POST /api/contacts/[id]/enrich  body: { field: "linkedin" | "email" | "phone" }
// The accuracy-gated provider waterfall lives in lib/contact-enrich so the REST
// route and the MCP `enrich_contact` tool behave identically.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`contact-enrich:${user.id}`, 30, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as { field?: Field } | null;
    const field = body?.field;
    if (!field || !["linkedin", "email", "phone"].includes(field)) {
      return NextResponse.json({ error: "field must be linkedin, email, or phone" }, { status: 400 });
    }

    const result = await enrichContactField(user.id, id, field);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/contacts/[id]/enrich", e);
    return NextResponse.json({ error: "Enrichment failed - please try again." }, { status: 502 });
  }
}
