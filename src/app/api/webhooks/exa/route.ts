import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractAndAddToCrm, type ExtractItem } from "@/lib/radar-extract";
import { exaWebhookTokenValid } from "@/lib/exa";

// POST /api/webhooks/exa - receives Exa Monitor result payloads.
// Each monitor was created with a specific userId stored in IntentMonitor.
// We match by exaMonitorId -> userId, record the run for history, and (only when
// the monitor is set to auto-add) extract the REAL companies/people mentioned in
// the results. We never dump the article pages / publishers themselves as
// entities, and the same shared extractor dedupes against the CRM.
//
// This endpoint writes into a user's CRM, so it is gated by a secret token that
// we registered into the monitor's webhook URL (?t=). Any call without the valid
// token is rejected here, before the body is trusted. Monitors created before
// this token existed simply fall through to the Inngest polling path.
export async function POST(req: NextRequest) {
  try {
    // Authenticate the caller before doing anything with the payload.
    const token = req.nextUrl.searchParams.get("t");
    if (!exaWebhookTokenValid(token)) {
      console.warn("[exa-webhook] rejected: missing or invalid token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      monitor_id?: string;
      results?: { id?: string; url?: string; title?: string; highlights?: string[]; summary?: string }[];
    } | null;

    if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const monitorId = body.monitor_id;
    // Cap the batch so an oversized payload can't drive unbounded extraction.
    const results = (body.results ?? []).slice(0, 100);

    // Find the monitor to get userId + auto-add setting.
    const monitor = monitorId
      ? await prisma.intentMonitor.findFirst({ where: { exaMonitorId: monitorId } })
      : null;

    if (!monitor) {
      console.warn(`[exa-webhook] unknown monitor_id: ${monitorId}`);
      return NextResponse.json({ ok: true, ingested: 0, reason: "unmatched monitor" });
    }

    const items: ExtractItem[] = results
      .filter((r) => r.url)
      .map((r) => ({
        title: r.title ?? "",
        url: r.url,
        summary: r.summary ?? ((r.highlights ?? []).join(" ") || undefined),
      }));

    // Auto-add extracts the real companies/people mentioned (deduped), instead of
    // saving the article/publisher pages as entities.
    let added = 0;
    if (monitor.autoAdd) {
      const { entitiesAdded, contactsAdded } = await extractAndAddToCrm(monitor.userId, items);
      added = entitiesAdded + contactsAdded;
    }

    // Always record the run so it shows in history and can be added manually.
    await prisma.monitorRun.create({
      data: {
        userId: monitor.userId,
        monitorId: monitor.id,
        items: items as unknown as Prisma.InputJsonValue,
        found: items.length,
        added,
        addedToCrm: monitor.autoAdd,
      },
    });

    await prisma.intentMonitor.update({
      where: { id: monitor.id },
      data: { lastRunAt: new Date() },
    });

    return NextResponse.json({ ok: true, found: items.length, ingested: added });
  } catch (e) {
    console.error("POST /api/webhooks/exa", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
