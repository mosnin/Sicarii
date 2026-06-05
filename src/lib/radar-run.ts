// Execute one intent monitor: pull results, optionally auto-add to the CRM, and
// always record a MonitorRun for history. Shared by Inngest (scheduled) and the
// "Run now" endpoint.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exaIntentSearch, isMeaningful } from "@/lib/exa";

export interface RunItem { title: string; url: string; summary?: string }
export interface CreatedItem { id: string; kind: "entity"; name: string | null; domain: string | null; url: string | null }

export async function runIntentMonitorOnce(monitor: {
  id: string;
  userId: string;
  query: string;
  autoAdd: boolean;
}): Promise<{ found: number; added: number; runId: string; created: CreatedItem[] }> {
  const results = await exaIntentSearch(monitor.query, {
    numResults: 10,
    includeHighlights: true,
    includeSummary: true,
  });

  const items: RunItem[] = results
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title ?? "",
      url: r.url,
      summary: r.summary ?? ((r.highlights ?? []).join(" ") || undefined),
    }));

  let added = 0;
  const created: CreatedItem[] = [];

  if (monitor.autoAdd) {
    for (const r of results) {
      if (!r.url) continue;
      let domain: string | undefined;
      try { domain = new URL(r.url).hostname.replace(/^www\./, ""); } catch { /* skip */ }
      const name = isMeaningful(r.title) ? r.title : domain;
      if (!isMeaningful(name)) continue;
      if (domain) {
        const exists = await prisma.entity.findFirst({ where: { userId: monitor.userId, domain }, select: { id: true } });
        if (exists) continue;
      }
      const entity = await prisma.entity.create({
        data: {
          userId: monitor.userId,
          name,
          domain,
          website: r.url,
          source: "intent-monitor",
          tags: ["intent"],
          notes: [r.summary, ...(r.highlights ?? [])].filter(Boolean).join("\n\n") || undefined,
        },
      });
      created.push({ id: entity.id, kind: "entity", name: entity.name, domain: entity.domain, url: entity.website });
      added++;
    }
  }

  const run = await prisma.monitorRun.create({
    data: {
      userId: monitor.userId,
      monitorId: monitor.id,
      items: items as unknown as Prisma.InputJsonValue,
      found: items.length,
      added,
      addedToCrm: monitor.autoAdd,
    },
  });

  return { found: items.length, added, runId: run.id, created };
}
