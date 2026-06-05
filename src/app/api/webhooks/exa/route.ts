import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/webhooks/exa - receives Exa Monitor result payloads.
// Each monitor was created with a specific userId stored in IntentMonitor.
// We match by exaMonitorId → userId and save new results as entities.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      monitor_id?: string;
      results?: { id?: string; url?: string; title?: string; highlights?: string[]; summary?: string }[];
    } | null;

    if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const monitorId = body.monitor_id;
    const results = body.results ?? [];

    // Find the monitor to get userId
    const monitor = monitorId
      ? await prisma.intentMonitor.findFirst({ where: { exaMonitorId: monitorId } })
      : null;

    if (!monitor) {
      console.warn(`[exa-webhook] unknown monitor_id: ${monitorId}`);
      return NextResponse.json({ ok: true, ingested: 0, reason: "unmatched monitor" });
    }

    let ingested = 0;
    for (const r of results) {
      if (!r.url) continue;
      let domain: string | undefined;
      try { domain = new URL(r.url).hostname.replace(/^www\./, ""); } catch { continue; }

      // Deduplication: skip if entity with same domain already exists for this user.
      const exists = await prisma.entity.findFirst({
        where: { userId: monitor.userId, domain },
        select: { id: true },
      });
      if (exists) continue;

      await prisma.entity.create({
        data: {
          userId: monitor.userId,
          name: r.title ?? domain,
          domain,
          website: r.url,
          source: "exa-webhook",
          tags: ["intent"],
          notes: [r.summary, ...(r.highlights ?? [])].filter(Boolean).join("\n\n") || undefined,
        },
      });
      ingested++;
    }

    await prisma.intentMonitor.update({
      where: { id: monitor.id },
      data: { lastRunAt: new Date() },
    });

    return NextResponse.json({ ok: true, ingested });
  } catch (e) {
    console.error("POST /api/webhooks/exa", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
