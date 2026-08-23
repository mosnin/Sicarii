import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError, swarmDiscover, listSwarmRuns } from "@/lib/crm-operations";

export const maxDuration = 60;

// POST /api/discover/swarm - launch a swarm discovery run from the dashboard.
//
// Metering note (founder call): unlike the generic /api/discover switch (which
// is Clerk-session-only, free, and returns results for the human to review and
// add manually), a swarm run auto-creates CRM entities in one step - the same
// shape as the find_companies/maps_leads MCP tools, which DO cost credits. So
// this route calls the SAME metered op function (swarmDiscover) those tools
// use rather than a free raw-search path: dashboard usage is billed exactly
// like agent usage, with the same gate-up-front/debit-per-hit policy. See
// docs/decisions/0011-swarm-discovery.md for the full credit model.
const bodySchema = z.object({
  goal: z.string().trim().min(3).max(1000),
  angles: z.array(z.string().trim().max(300)).max(6).optional(),
  anglesN: z.number().int().min(2).max(6).optional(),
  count: z.number().int().min(1).max(25).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    // Tight limit: each call fans out up to 6 parallel paid Exa searches (plus
    // an OpenAI angle-derivation call), so this is the most expensive single
    // action a human can trigger from the dashboard.
    const rate = await checkRateLimit(`discover:swarm:${user.id}`, 5, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many swarm runs - slow down a moment." }, { status: 429 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await swarmDiscover(user.id, parsed.data);
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/discover/swarm", e);
    return NextResponse.json({ error: "Swarm discovery failed. Please try again." }, { status: 500 });
  }
}

// GET /api/discover/swarm - the results surface: recent swarm runs for this
// user, newest first, so past runs stay auditable and viewable.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const runs = await listSwarmRuns(user.id, Number.isFinite(limit) ? limit : undefined);
    return NextResponse.json({ runs });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/discover/swarm", e);
    return NextResponse.json({ error: "Failed to load swarm runs." }, { status: 500 });
  }
}
