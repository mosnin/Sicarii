// Inngest background functions - scheduled research + intent scans.
// Runs every hour; processes all due monitors/schedules for all users.

import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/prisma";
import { isExaConfigured } from "@/lib/exa";
import { notifyTaskWebhook } from "@/lib/notify";
import { runIntentMonitorOnce } from "@/lib/radar-run";
import { runAutopilotPlanOnce } from "@/lib/autopilot-run";
import { rolloverAutopilotWindow, cadenceMs } from "@/lib/autopilot-operations";
import { processDueResearchSchedules } from "@/lib/research-schedule-run";

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
      // Compute the next slot up front so we can advance it whether the run
      // succeeds OR fails - a run that throws (e.g. out of credits) must still
      // push nextRunAt forward, otherwise the monitor stays "due" and gets
      // re-queried every hour until credits refill (weeks of wasted polling).
      const nextRun = new Date(now);
      if (monitor.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
      else if (monitor.frequency === "hourly") nextRun.setHours(nextRun.getHours() + 1);
      else nextRun.setDate(nextRun.getDate() + 1);

      try {
        // Run + record history (auto-adds to CRM only when the monitor says so).
        const { added, created } = await runIntentMonitorOnce(monitor);
        saved += added;

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
        // Advance the schedule anyway (don't touch lastRunAt - it didn't run).
        await prisma.intentMonitor
          .update({ where: { id: monitor.id }, data: { nextRunAt: nextRun } })
          .catch(() => {});
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
  async () => processDueResearchSchedules(),
);

// ── Budgeted Autopilot ────────────────────────────────────────────────────────
// Runs each active plan's bounded work tick (see autopilot-run.ts), then either
// rolls its window over (still active - fresh budget, same cadence) or leaves
// it exactly as the budget guard left it (paused/exhausted mid-tick, so a
// human can see why). Advances nextRunAt whether the tick succeeds or throws,
// same policy as the other schedulers: a failing plan must not stay "due"
// forever and get retried every sweep.

export const runAutopilotPlans = inngest.createFunction(
  {
    id: "run-autopilot-plans",
    name: "Run budgeted autopilot plans",
    triggers: [{ cron: "15 * * * *" }], // 15 min past every hour (offset from the other two crons)
  },
  async () => {
    const now = new Date();
    const plans = await prisma.autopilotPlan.findMany({
      where: { status: "active", nextRunAt: { lte: now } },
      include: { allocations: true },
    });

    let processed = 0;
    const webhookCache = new Map<string, string | null>();
    for (const plan of plans) {
      const nextRun = new Date(now.getTime() + cadenceMs(plan.cadence));
      try {
        const result = await runAutopilotPlanOnce(plan);

        if (result.status === "active") {
          // The tick used some (or none) of the window's budget but never hit
          // a cap - roll the window forward and reset spent for the next cycle.
          await rolloverAutopilotWindow(plan.id, now, nextRun);
        } else {
          // The budget guard already hard-stopped the plan (paused/exhausted)
          // and stamped pausedReason - just advance the schedule bookkeeping,
          // don't touch spent/window (it's the evidence of what happened).
          await prisma.autopilotPlan.update({
            where: { id: plan.id },
            data: { lastRunAt: now, nextRunAt: nextRun },
          });
        }
        processed++;

        if (result.ranSteps.length > 0) {
          const url = await getWebhook(webhookCache, plan.userId);
          await notifyTaskWebhook(url, {
            event: "autopilot-plan.completed",
            taskId: plan.id,
            name: plan.name,
            query: `Autopilot ${plan.cadence} run (${plan.status}): ${[...new Set(result.ranSteps)].join(", ")}.`,
            created: result.touched.length,
            items: result.touched,
            completedAt: now.toISOString(),
          });
        }
      } catch (e) {
        console.error(`[inngest] autopilot plan ${plan.id} failed`, e);
        await prisma.autopilotPlan
          .update({ where: { id: plan.id }, data: { nextRunAt: nextRun } })
          .catch(() => {});
      }
    }

    return { processed };
  }
);

export const functions = [runIntentMonitors, runResearchSchedules, runAutopilotPlans];
