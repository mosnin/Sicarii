// GET /api/tasks - this user's outstanding queue work.
//
// The operator's view of what their agent has promised: the reason it gave,
// when it comes due, and whether it is running right now. Open tasks only;
// finished ones are history, not work.
//
// Query params: kind (filter to one task kind), limit (1-200, default 50).

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { listOpenTasks, MAX_ATTEMPTS } from "@/lib/tasks";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const params = new URL(req.url).searchParams;
    const kind = params.get("kind") ?? undefined;
    const limitParam = Number(params.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

    const tasks = await listOpenTasks(user.id, { kind, limit });
    const now = new Date();

    return NextResponse.json({
      count: tasks.length,
      maxAttempts: MAX_ATTEMPTS,
      tasks: tasks.map((t) => ({
        id: t.id,
        kind: t.kind,
        reason: t.reason,
        dueAt: t.dueAt,
        priority: t.priority,
        budget: t.budget,
        attempts: t.attempts,
        contactId: t.contactId,
        entityId: t.entityId,
        startedAt: t.startedAt,
        running: !!t.leasedUntil && t.leasedUntil > now,
        createdAt: t.createdAt,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/tasks", e);
    return NextResponse.json({ error: "Failed to list tasks" }, { status: 500 });
  }
}
