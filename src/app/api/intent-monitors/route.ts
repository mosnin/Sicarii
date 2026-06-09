import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createExaMonitor, deleteExaMonitor, isExaConfigured, exaWebhookToken } from "@/lib/exa";
import { planFor } from "@/lib/credits";

// GET /api/intent-monitors - list all monitors for the current user.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const monitors = await prisma.intentMonitor.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { runs: true } } },
    });
    return NextResponse.json({ monitors });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/intent-monitors", e);
    return NextResponse.json({ error: "Failed to list monitors" }, { status: 500 });
  }
}

// POST /api/intent-monitors - create a new intent monitor.
// Registers it with Exa (if configured) and saves locally.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const body = (await req.json().catch(() => null)) as {
      name?: string;
      query?: string;
      frequency?: "daily" | "weekly" | "hourly";
      autoAdd?: boolean;
    } | null;

    if (!body?.query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    if (body.query.length > 2000 || (body.name && body.name.length > 200)) {
      return NextResponse.json({ error: "query or name is too long" }, { status: 400 });
    }
    const name = (body.name?.trim() || body.query.slice(0, 60)).slice(0, 200);

    if (!isExaConfigured()) {
      return NextResponse.json({ error: "EXA_API_KEY is not configured" }, { status: 501 });
    }

    // Plan limit: scheduled monitors are a paid-plan feature with a per-plan cap.
    const allowed = planFor(user.plan).monitors;
    const existingCount = await prisma.intentMonitor.count({ where: { userId: user.id } });
    if (existingCount >= allowed) {
      return NextResponse.json(
        { error: `Your plan allows ${allowed} scheduled monitor${allowed === 1 ? "" : "s"}.` },
        { status: 402 },
      );
    }

    // First scheduled run: next hour/day/week depending on frequency.
    const nextRunAt = new Date();
    if (body.frequency === "hourly") nextRunAt.setHours(nextRunAt.getHours() + 1);
    else if (body.frequency === "weekly") nextRunAt.setDate(nextRunAt.getDate() + 7);
    else nextRunAt.setDate(nextRunAt.getDate() + 1);

    // Register with Exa Monitors for webhook delivery on top of Inngest polling.
    // The webhook URL carries a secret token so the receiver can reject any call
    // that isn't a monitor we registered (the callback writes into the CRM).
    let exaMonitorId: string | undefined;
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz";
      const token = exaWebhookToken();
      const webhookUrl = `${base}/api/webhooks/exa${token ? `?t=${token}` : ""}`;
      const exaMon = await createExaMonitor({
        query: body.query,
        webhookUrl,
        runEvery: body.frequency === "weekly" ? "week" : "day",
        numResults: 10,
      });
      exaMonitorId = exaMon.id;
    } catch (e) {
      // Exa Monitor creation is best-effort; Inngest polling is the fallback.
      console.warn("[intent-monitors] Exa monitor creation failed (Inngest will poll instead):", e);
    }

    const monitor = await prisma.intentMonitor.create({
      data: {
        userId: user.id,
        name,
        query: body.query,
        frequency: body.frequency ?? "daily",
        autoAdd: body.autoAdd ?? true,
        exaMonitorId,
        nextRunAt,
      },
    });

    return NextResponse.json({ monitor }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/intent-monitors", e);
    return NextResponse.json({ error: "Failed to create monitor" }, { status: 500 });
  }
}

// DELETE /api/intent-monitors?id=xxx - delete a monitor.
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const monitor = await prisma.intentMonitor.findUnique({ where: { id } });
    if (!monitor || monitor.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Remove from Exa if registered
    if (monitor.exaMonitorId) {
      try { await deleteExaMonitor(monitor.exaMonitorId); } catch { /* best-effort */ }
    }

    await prisma.intentMonitor.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("DELETE /api/intent-monitors", e);
    return NextResponse.json({ error: "Failed to delete monitor" }, { status: 500 });
  }
}
