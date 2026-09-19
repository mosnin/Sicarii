import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError, matchDiscover } from "@/lib/crm-operations";

/**
 * GET /api/discover/match?email=<>&domain=<>
 *
 * Returns the first exact-matching contact (by email) and/or entity (by domain)
 * scoped to the authenticated user. Used by the Discover UI to decide whether
 * to offer "Add to CRM" or "Update existing record".
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim().toLowerCase() || null;
    const domain = searchParams.get("domain")?.trim().toLowerCase() || null;

    const { contact, entity } = await matchDiscover(user.id, { email, domain });
    return NextResponse.json({ contact, entity });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/discover/match", e);
    return NextResponse.json({ error: "Match lookup failed" }, { status: 500 });
  }
}
