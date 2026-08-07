import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import {
  deleteSocialMonitor,
  getSocialMonitor,
  updateSocialMonitor,
} from "@/lib/social-opportunities";

// GET /api/social/monitors/[id] - one watch, ownership-checked.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const monitor = await getSocialMonitor(user.id, id);
    return NextResponse.json({ monitor });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/social/monitors/[id]", e);
    return NextResponse.json({ error: "Failed to load social monitor" }, { status: 500 });
  }
}

// PATCH /api/social/monitors/[id] - rename, pause/resume, retune.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`social-monitor-update:${user.id}`, 60, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const monitor = await updateSocialMonitor(user.id, id, {
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      ...(typeof body.frequency === "string" ? { frequency: body.frequency } : {}),
      ...(typeof body.resultsLimit === "number" ? { resultsLimit: body.resultsLimit } : {}),
    });
    return NextResponse.json({ monitor });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/social/monitors/[id]", e);
    return NextResponse.json({ error: "Failed to update social monitor" }, { status: 500 });
  }
}

// DELETE /api/social/monitors/[id] - drop the schedule. Opportunities already
// found stay in the review queue.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const result = await deleteSocialMonitor(user.id, id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/social/monitors/[id]", e);
    return NextResponse.json({ error: "Failed to delete social monitor" }, { status: 500 });
  }
}
