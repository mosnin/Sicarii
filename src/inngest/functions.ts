// Inngest background functions - scheduled research + intent scans.
// Runs every hour; processes all due monitors/schedules for all users.

import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/prisma";
import { exaIntentSearch, isExaConfigured, isMeaningful } from "@/lib/exa";
import { linkupDeepResearch, linkupSearch, isLinkupConfigured } from "@/lib/linkup";
import { notifyTaskWebhook } from "@/lib/notify";
import { runIntentMonitorOnce } from "@/lib/radar-run";
import { checkCreationBudget } from "@/lib/creation-guard";

type CreatedItem = { id: string; kind: "entity" | "contact"; name?: string | null; domain?: string | null; url?: string | null };

// Per-run cache of each user's outbound webhook URL.
async function getWebhook(cache: Map<string, string | null>, userId: string): Promise<string | null> {
  if (cache.has(userId)) return cache.get(userId)!;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { taskWebhookUrl: true } });
  const url = u?.taskWebhookUrl ?? null;
  cache.set(userId, url);
  return url;
}

// ── Intent Monitors ───────────────────────────────────────────────────────────
// Runs Exa neural search for each active monitor due to fire, deduplicates by
// domain, and saves new results as entities tagged "intent".

export const runIntentMonitors = inngest.createFunction(
  {
    id: "run-intent-monitors",
    name: "Run intent monitors",
    triggers: [{ cron: "0 * * * *" }], // top of every hour
  },
  async () => {
    if (!isExaConfigured()) return { skipped: "EXA_API_KEY not configured" };

    const now = new Date();
    const monitors = await prisma.intentMonitor.findMany({
      where: { active: true, nextRunAt: { lte: now } },
    });

    let saved = 0;
    const webhookCache = new Map<string, string | null>();
    for (const monitor of monitors) {
      try {
        // Run + record history (auto-adds to CRM only when the monitor says so).
        const { added, created } = await runIntentMonitorOnce(monitor);
        saved += added;

        const nextRun = new Date(now);
        if (monitor.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
        else if (monitor.frequency === "hourly") nextRun.setHours(nextRun.getHours() + 1);
        else nextRun.setDate(nextRun.getDate() + 1);

        await prisma.intentMonitor.update({
          where: { id: monitor.id },
          data: { lastRunAt: now, nextRunAt: nextRun },
        });

        // Wake the user's agent if they registered a webhook.
        if (created.length > 0) {
          const url = await getWebhook(webhookCache, monitor.userId);
          await notifyTaskWebhook(url, {
            event: "intent-monitor.completed",
            taskId: monitor.id,
            name: monitor.name,
            query: monitor.query,
            created: created.length,
            items: created,
            completedAt: now.toISOString(),
          });
        }
      } catch (e) {
        console.error(`[inngest] intent monitor ${monitor.id} failed`, e);
      }
    }

    return { processed: monitors.length, saved };
  }
);

// ── Research Schedules ────────────────────────────────────────────────────────
// Runs Linkup (or Exa) deep research for each active schedule due to fire.
// If target record specified: merges research into its notes.
// If no target: saves top sources as new entities (deduped by domain).

export const runResearchSchedules = inngest.createFunction(
  {
    id: "run-research-schedules",
    name: "Run research schedules",
    triggers: [{ cron: "30 * * * *" }], // 30 min past every hour
  },
  async () => {
    const now = new Date();
    const schedules = await prisma.researchSchedule.findMany({
      where: { active: true, nextRunAt: { lte: now } },
    });

    let updated = 0;
    const webhookCache = new Map<string, string | null>();
    for (const schedule of schedules) {
      try {
        const created: CreatedItem[] = [];
        const useLinkup = schedule.provider === "linkup" && isLinkupConfigured();
        const useExa = schedule.provider === "exa" && isExaConfigured();
        if (!useLinkup && !useExa) continue;

        let answer: string | undefined;
        let sources: { url: string; title?: string; snippet?: string }[] = [];

        if (useLinkup) {
          const result = schedule.depth === "deep"
            ? await linkupDeepResearch(schedule.query)
            : await linkupSearch(schedule.query);
          answer = result.answer;
          sources = result.sources;
        } else if (useExa) {
          const results = await exaIntentSearch(schedule.query, {
            numResults: 10,
            includeText: true,
            includeSummary: true,
          });
          sources = results.map((r) => ({
            url: r.url,
            title: r.title,
            snippet: r.summary ?? r.text?.slice(0, 300),
          }));
        }

        const researchNote = [
          answer,
          ...sources.slice(0, 5).map((s) => [s.title, s.snippet].filter(Boolean).join(": ")),
        ].filter(Boolean).join("\n\n");

        if (schedule.targetType === "entity" && schedule.targetId) {
          await prisma.entity.updateMany({
            where: { id: schedule.targetId, userId: schedule.userId },
            data: { notes: researchNote || undefined, status: "ENRICHED" },
          });
          created.push({ id: schedule.targetId, kind: "entity" });
        } else if (schedule.targetType === "contact" && schedule.targetId) {
          await prisma.contact.updateMany({
            where: { id: schedule.targetId, userId: schedule.userId },
            data: { notes: researchNote || undefined, status: "ENRICHED" },
          });
          created.push({ id: schedule.targetId, kind: "contact" });
        } else {
          for (const source of sources.slice(0, 5)) {
            // Creation circuit breaker: this direct-create path must also honor
            // the flood guard, or research schedules can ingest unchecked.
            if (!(await checkCreationBudget(schedule.userId)).ok) break;
            if (!source.url) continue;
            let domain: string | undefined;
            try { domain = new URL(source.url).hostname.replace(/^www\./, ""); } catch { continue; }

            const name = isMeaningful(source.title) ? source.title : domain;
            if (!isMeaningful(name)) continue;

            const exists = await prisma.entity.findFirst({
              where: { userId: schedule.userId, domain },
              select: { id: true },
            });
            if (exists) continue;

            const entity = await prisma.entity.create({
              data: {
                userId: schedule.userId,
                name,
                domain,
                website: source.url,
                description: source.snippet ?? undefined,
                source: "research-schedule",
                tags: ["research"],
              },
            });
            created.push({ id: entity.id, kind: "entity", name: entity.name, domain: entity.domain, url: entity.website });
          }
        }

        const nextRun = new Date(now);
        if (schedule.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
        else if (schedule.frequency === "hourly") nextRun.setHours(nextRun.getHours() + 1);
        else nextRun.setDate(nextRun.getDate() + 1);

        await prisma.researchSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt: nextRun },
        });
        updated++;

        if (created.length > 0) {
          const url = await getWebhook(webhookCache, schedule.userId);
          await notifyTaskWebhook(url, {
            event: "research-schedule.completed",
            taskId: schedule.id,
            name: schedule.name,
            query: schedule.query,
            created: created.length,
            items: created,
            completedAt: now.toISOString(),
          });
        }
      } catch (e) {
        console.error(`[inngest] research schedule ${schedule.id} failed`, e);
      }
    }

    return { processed: schedules.length, updated };
  }
);

export const functions = [runIntentMonitors, runResearchSchedules];
