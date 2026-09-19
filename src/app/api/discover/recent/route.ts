import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError, listRecentDiscoveries } from "@/lib/crm-operations";

// GET /api/discover/recent - the last 20 contacts + entities added via discovery.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const results = await listRecentDiscoveries(user.id, 20);
    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Failed to load recent results." }, { status: 500 });
  }
}
