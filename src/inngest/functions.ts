// Inngest background functions - scheduled research + intent scans.
// Runs every hour; processes all due monitors/schedules for all users.

import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/prisma";
import { exaIntentSearch, isExaConfigured } from "@/lib/exa";
import { linkupDeepResearch, linkupSearch, isLinkupConfigured } from "@/lib/linkup";

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
    for (const monitor of monitors) {
      try {
        const results = await exaIntentSearch(monitor.query, {
          numResults: 10,
          includeHighlights: true,
          includeSummary: true,
        });

        for (const r of results) {
          if (!r.url) continue;
          let domain: string | undefined;
          try { domain = new URL(r.url).hostname.replace(/^www\./, ""); } catch { /* skip */ }

          if (domain) {
            const exists = await prisma.entity.findFirst({
              where: { userId: monitor.userId, domain },
              select: { id: true },
            });
            if (exists) continue;
          }

          await prisma.entity.create({
            data: {
              userId: monitor.userId,
              name: r.title ?? domain ?? "Unknown",
              domain,
              website: r.url,
              source: "intent-monitor",
              tags: ["intent"],
              notes: [r.summary, ...(r.highlights ?? [])].filter(Boolean).join("\n\n") || undefined,
            },
          });
          saved++;
        }

        const nextRun = new Date(now);
        if (monitor.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
        else nextRun.setDate(nextRun.getDate() + 1);

        await prisma.intentMonitor.update({
          where: { id: monitor.id },
          data: { lastRunAt: now, nextRunAt: nextRun },
        });
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
    for (const schedule of schedules) {
      try {
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
        } else if (schedule.targetType === "contact" && schedule.targetId) {
          await prisma.contact.updateMany({
            where: { id: schedule.targetId, userId: schedule.userId },
            data: { notes: researchNote || undefined, status: "ENRICHED" },
          });
        } else {
          for (const source of sources.slice(0, 5)) {
            if (!source.url) continue;
            let domain: string | undefined;
            try { domain = new URL(source.url).hostname.replace(/^www\./, ""); } catch { continue; }

            const exists = await prisma.entity.findFirst({
              where: { userId: schedule.userId, domain },
              select: { id: true },
            });
            if (exists) continue;

            await prisma.entity.create({
              data: {
                userId: schedule.userId,
                name: source.title ?? domain ?? "Unknown",
                domain,
                website: source.url,
                description: source.snippet ?? undefined,
                source: "research-schedule",
                tags: ["research"],
              },
            });
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
      } catch (e) {
        console.error(`[inngest] research schedule ${schedule.id} failed`, e);
      }
    }

    return { processed: schedules.length, updated };
  }
);

export const functions = [runIntentMonitors, runResearchSchedules];
