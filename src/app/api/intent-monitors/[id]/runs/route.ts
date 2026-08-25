import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// GET /api/intent-monitors/[id]/runs - run history (most recent first).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const monitor = await prisma.intentMonitor.findUnique({ where: { id } });
    if (!monitor || monitor.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const runs = await prisma.monitorRun.findMany({
      where: { monitorId: id, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ monitor, runs });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
  }
}
