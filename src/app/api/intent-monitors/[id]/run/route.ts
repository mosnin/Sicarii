import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { isExaConfigured } from "@/lib/exa";
import { runIntentMonitorOnce } from "@/lib/radar-run";

export const maxDuration = 60;

// POST /api/intent-monitors/[id]/run - run a monitor immediately and record it.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const rate = checkRateLimit(`monitor-run:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isExaConfigured()) return NextResponse.json({ error: "EXA_API_KEY is not configured." }, { status: 501 });

    const monitor = await prisma.intentMonitor.findUnique({ where: { id } });
    if (!monitor || monitor.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await runIntentMonitorOnce(monitor);
    await prisma.intentMonitor.update({ where: { id }, data: { lastRunAt: new Date() } });

    return NextResponse.json({ ok: true, found: result.found, added: result.added, runId: result.runId });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/intent-monitors/[id]/run", e);
    return NextResponse.json({ error: "Run failed" }, { status: 502 });
  }
}
