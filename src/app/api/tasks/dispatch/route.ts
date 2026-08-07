// POST /api/tasks/dispatch
//
// Runs one queue pass (seed what has come due, then run a bounded batch). The
// Inngest cron in src/inngest/functions.ts is the normal trigger; this is the
// plain-HTTP way in, for a platform cron, an on-call nudge, or a smoke test
// when Inngest itself is the thing that is broken.
//
// Calling it twice at once is safe by design: claims are leased with SKIP
// LOCKED, so two passes take disjoint work rather than running the same task
// twice. That property is the whole point of the queue, so this route does not
// try to serialize callers.
//
// Authentication: the internal CRON_SECRET (Authorization: Bearer <secret>),
// the same guard /api/provenance/re-verify uses. No user auth: the dispatcher
// is cross-tenant by nature and takes no tenant input.

// One pass is bounded well inside this ceiling (see INVOCATION_BUDGET_MS in
// src/lib/dispatch.ts); the margin is there so the last task in a batch can
// finish and be recorded rather than being killed by the platform.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runDueTasks } from "@/inngest/functions";

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueTasks();
    console.log(
      `[dispatch] seeded=${JSON.stringify(result.seeded)} claimed=${result.claimed} completed=${result.completed} failed=${result.failed} deferred=${result.deferred} retired=${result.retired}`,
    );
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("POST /api/tasks/dispatch", e);
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
