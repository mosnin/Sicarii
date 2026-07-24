import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { listPendingDrafts } from "@/lib/breakup-operations";

// GET /api/breakup-drafts - the review queue: pending breakup drafts, oldest
// first. Human-session only (getAuthenticatedUser is Clerk-session-only, never
// an agent API key) - this mirrors what the dashboard's review card renders.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const drafts = await listPendingDrafts(user.id);
    return NextResponse.json({ drafts });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/breakup-drafts", e);
    return NextResponse.json({ error: "Failed to load breakup drafts" }, { status: 500 });
  }
}
