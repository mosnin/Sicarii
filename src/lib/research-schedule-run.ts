// Execute due research schedules. Shared by the Inngest cron.
//
// nextRunAt is computed BEFORE the paid work and advanced whether the run
// succeeds or throws. Intent monitors and autopilot already do this. Research
// schedules used to only stamp nextRunAt on success, so a debit-then-provider
// failure left the row "due" and the next hourly sweep charged 18 credits
// again.

import { prisma } from "@/lib/prisma";
import { exaIntentSearch, isExaConfigured, isMeaningful } from "@/lib/exa";
import { linkupDeepResearch, linkupSearch, isLinkupConfigured } from "@/lib/linkup";
import { notifyTaskWebhook } from "@/lib/notify";
import { checkCreationBudget } from "@/lib/creation-guard";
import { spendCredits } from "@/lib/credits";

type CreatedItem = {
  id: string;
  kind: "entity" | "contact";
  name?: string | null;
  domain?: string | null;
  url?: string | null;
};

export function nextScheduleRunAt(now: Date, frequency: string): Date {
  const nextRun = new Date(now);
  if (frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
  else if (frequency === "hourly") nextRun.setHours(nextRun.getHours() + 1);
  else nextRun.setDate(nextRun.getDate() + 1);
  return nextRun;
}

async function getWebhook(cache: Map<string, string | null>, userId: string): Promise<string | null> {
  if (cache.has(userId)) return cache.get(userId)!;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { taskWebhookUrl: true } });
  const url = u?.taskWebhookUrl ?? null;
  cache.set(userId, url);
  return url;
}

/**
 * Process every active research schedule that is due. Always advances
 * nextRunAt once a run is attempted (credits spent or provider called), so a
 * failed lookup cannot stay due and re-bill every hourly sweep.
 */
export async function processDueResearchSchedules(now = new Date()): Promise<{
  processed: number;
  updated: number;
}> {
  const schedules = await prisma.researchSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
  });

  let updated = 0;
  const webhookCache = new Map<string, string | null>();
  for (const schedule of schedules) {
    const useLinkup = schedule.provider === "linkup" && isLinkupConfigured();
    const useExa = schedule.provider === "exa" && isExaConfigured();
    // No provider configured: leave the row due. We have not spent credits.
    if (!useLinkup && !useExa) continue;

    const nextRun = nextScheduleRunAt(now, schedule.frequency);
    try {
      const created: CreatedItem[] = [];

      // Debit before the paid lookup so an out-of-credits account skips this
      // cycle (the catch still advances nextRunAt, same as intent monitors).
      await spendCredits(schedule.userId, "deep_research", { ref: schedule.id });

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
      // Advance the schedule anyway (do not touch lastRunAt: it did not finish).
      await prisma.researchSchedule
        .update({ where: { id: schedule.id }, data: { nextRunAt: nextRun } })
        .catch(() => {});
    }
  }

  return { processed: schedules.length, updated };
}
