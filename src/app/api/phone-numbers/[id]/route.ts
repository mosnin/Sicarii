// GET    /api/phone-numbers/[id] - one number, reconciled against the carrier
// DELETE /api/phone-numbers/[id] - release it
//
// Next 16: dynamic route params arrive as a Promise and must be awaited.
// Ownership is enforced in the ops layer, not here, so every caller gets it.

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import { getNumber, refreshNumberStatus, releaseNumber } from "@/lib/telephony/provisioning";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await ctx.params;
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const number = refresh ? await refreshNumberStatus(user.id, id) : await getNumber(user.id, id);
    return NextResponse.json({ number });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/phone-numbers/[id]", e);
    return NextResponse.json({ error: "Failed to load that number" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await ctx.params;
    const number = await releaseNumber(user.id, id);
    return NextResponse.json({ number });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/phone-numbers/[id]", e);
    return NextResponse.json({ error: "Failed to release that number" }, { status: 500 });
  }
}
