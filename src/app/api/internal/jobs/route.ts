import { NextRequest, NextResponse } from "next/server";
import { OpError } from "@/lib/op-error";
import { parseMailboxJob, runMailboxJob } from "@/lib/mailbox-jobs";
import { authorizeWorkerRequest } from "@/lib/worker-secret";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await authorizeWorkerRequest(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => null)) as { job?: unknown } | null;
    const job = parseMailboxJob(body?.job);
    const result = await runMailboxJob(job);
    return NextResponse.json({ ok: true, type: job.type, result });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/internal/jobs", e);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
