import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { listVariantStats } from "@/lib/variant-operations";

// GET /api/variants?segmentId= - read-only reply-rate stats for outreach
// variants (subject lines / openers), grouped by segment. The agent creates
// and selects variants over MCP (create_variant / select_variant); this
// surface is observe-only for the human - there is no human "start an A/B
// test" flow by design, the bandit runs itself.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const segmentId = req.nextUrl.searchParams.get("segmentId");
    const variants = await listVariantStats(user.id, segmentId ? { segmentId } : {});
    return NextResponse.json({ variants });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/variants", e);
    return NextResponse.json({ error: "Failed to load variant stats" }, { status: 500 });
  }
}
