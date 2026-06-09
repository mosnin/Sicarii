// Execute one intent monitor: pull results, optionally auto-add to the CRM, and
// always record a MonitorRun for history. Shared by Inngest (scheduled) and the
// "Run now" endpoint.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exaIntentSearch } from "@/lib/exa";
import { extractAndAddToCrm, type CreatedItem } from "@/lib/radar-extract";
import { spendCredits } from "@/lib/credits";

export interface RunItem { title: string; url: string; summary?: string }
export type { CreatedItem };

export async function runIntentMonitorOnce(monitor: {
  id: string;
  userId: string;
  query: string;
  autoAdd: boolean;
}): Promise<{ found: number; added: number; runId: string; created: CreatedItem[] }> {
  // Each run consumes an Exa search; debit before running. When the user is
  // out of credits, skip gracefully - the caller (cron or "Run now") logs the
  // OpError and the monitor simply doesn't fire this cycle.
  await spendCredits(monitor.userId, "monitor_run", { ref: monitor.id });

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
  let created: CreatedItem[] = [];

  // Auto-add extracts the real companies/people mentioned in the results (same
  // path as the manual "Add to CRM" button), deduped, rather than dumping the
  // articles/publishers themselves as entities.
  if (monitor.autoAdd) {
    const result = await extractAndAddToCrm(monitor.userId, items);
    added = result.entitiesAdded + result.contactsAdded;
    created = result.created;
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
