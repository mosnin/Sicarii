import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { listSocialOpportunities } from "@/lib/social-opportunities";

// GET /api/social/opportunities - the review queue a human works through.
// Nothing here is a contact: these are posts, and the author is unverified by
// construction (the provider returns no match score of any kind).
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const minScoreParam = Number(url.searchParams.get("minIntentScore"));

    const opportunities = await listSocialOpportunities(user.id, {
      status: url.searchParams.get("status") ?? undefined,
      monitorId: url.searchParams.get("monitorId") ?? undefined,
      ...(Number.isFinite(minScoreParam) ? { minIntentScore: minScoreParam } : {}),
      ...(Number.isFinite(limitParam) ? { limit: limitParam } : {}),
    });
    return NextResponse.json({ opportunities });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/social/opportunities", e);
    return NextResponse.json({ error: "Failed to load social opportunities" }, { status: 500 });
  }
}
