import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchCrm } from "@/lib/crm-operations";

// GET /api/search?q= - search the user's CRM (companies + contacts) for the
// global search surfaced in the dashboard hero.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    // Generous ceiling: type-ahead never hits it, bulk enumeration does.
    const rate = await checkRateLimit(`search:${user.id}`, 120, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ entities: [], contacts: [] });
    }

    const { entities, contacts } = await searchCrm(user.id, q);

    return NextResponse.json({
      entities: entities.slice(0, 6).map((e) => ({
        id: e.id,
        name: e.name,
        domain: e.domain,
        industry: e.industry,
      })),
      contacts: contacts.slice(0, 6).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        company: c.company,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/search", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
