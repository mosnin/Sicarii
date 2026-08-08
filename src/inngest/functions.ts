// Inngest is the alarm clock, not the worker.
//
// This file used to BE the scheduler: three hourly crons, each selecting every
// due row for every user and running them in one serial loop. That shape had no
// leasing (two overlapping invocations ran the same row twice and charged twice
// for it), no bound on the batch (one slow row starved the tail), and no attempt
// counter (a permanently broken row was retried forever).
//
// Now the same work is expressed as task kinds on the leased queue (see
// src/lib/tasks.ts and src/lib/dispatch.ts). Inngest does two small things on a
// timer: seed due schedule rows into tasks, then ask the dispatcher to run a
// bounded batch. The scheduling columns on IntentMonitor / ResearchSchedule /
// AutopilotPlan stay the source of truth for WHEN work happens; the queue only
// owns HOW it gets run.

import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/prisma";
import { exaIntentSearch, isExaConfigured, isMeaningful } from "@/lib/exa";
import { linkupDeepResearch, linkupSearch, isLinkupConfigured } from "@/lib/linkup";
import { notifyTaskWebhook } from "@/lib/notify";
import { runIntentMonitorOnce } from "@/lib/radar-run";
import { runAutopilotPlanOnce } from "@/lib/autopilot-run";
import { rolloverAutopilotWindow, cadenceMs } from "@/lib/autopilot-operations";
import { checkCreationBudget } from "@/lib/creation-guard";
import { spendCredits } from "@/lib/credits";
import { enqueueTask } from "@/lib/tasks";
import {
  dispatchTasks,
  registerTaskHandler,
  type DispatchSummary,
  type TaskHandler,
} from "@/lib/dispatch";
import {
  MAILBOX_INGEST_KIND,
  CALENDAR_INGEST_KIND,
  handleMailboxIngest,
  handleCalendarIngest,
} from "@/lib/mailbox-ingest";
import { registerSocialTaskHandlers } from "@/lib/social-tasks";
import { VOICE_FOLLOW_UP_KIND, handleVoiceFollowUp } from "@/lib/internal-voice";

type CreatedItem = { id: string; kind: "entity" | "contact"; name?: string | null; domain?: string | null; url?: string | null };

/** Task kinds this file owns. Kept as constants so the seeder, the handlers,
 *  and the MCP tools all name the same thing. */
export const TASK_KIND = {
  intentMonitor: "intent_monitor",
  researchSchedule: "research_schedule",
  autopilotPlan: "autopilot_plan",
} as const;

/** How many due schedule rows one seeding pass turns into tasks, per kind.
 *  Seeding is cheap, but it still has to be bounded: an unbounded seeder is the
 *  same unbounded batch we just removed, one layer up. Anything left over is
 *  picked up by the next pass, still ordered by how long it has been due. */
const SEED_LIMIT = 200;

/** Don't re-seed a schedule whose last task finished inside this window. A
 *  healthy schedule is gated by its own nextRunAt, so this only ever bites a
 *  schedule that keeps failing: without it, a row that retires after using up
 *  its attempts is re-queued by the very next five-minute sweep. Thirty
 *  minutes keeps a broken schedule closer to the hourly cadence the old crons
 *  gave it, and is short enough never to delay an hourly schedule (whose
 *  nextRunAt is a full hour out). */
const SEED_COOLDOWN_MS = 30 * 60_000;

// Per-pass cache of each user's outbound webhook URL, so a batch touching the
// same user ten times looks it up once. Reset at the start of every dispatcher
// pass: a warm serverless container can live for hours, and a webhook URL the
// user changed in the app must not stay cached across passes.
const webhookCache = new Map<string, string | null>();

function resetWebhookCache(): void {
  webhookCache.clear();
}

async function getWebhook(userId: string): Promise<string | null> {
  if (webhookCache.has(userId)) return webhookCache.get(userId)!;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { taskWebhookUrl: true } });
  const url = u?.taskWebhookUrl ?? null;
  webhookCache.set(userId, url);
  return url;
}

/** The next slot for a frequency-based schedule, computed from a fixed "now"
 *  exactly as the old crons did. */
function nextSlot(now: Date, frequency: string): Date {
  const next = new Date(now);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "hourly") next.setHours(next.getHours() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

/** The row id a schedule task points at, stashed on the payload by the seeder. */
function refOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const ref = (payload as Record<string, unknown>).ref;
  return typeof ref === "string" ? ref : null;
}

// ── Intent monitors ───────────────────────────────────────────────────────────
// Runs Exa neural search for the monitor, deduplicates by domain, and saves new
// results as entities tagged "intent" (all inside runIntentMonitorOnce).

const intentMonitorHandler: TaskHandler = async (task, { now }) => {
  const id = refOf(task.payload);
  if (!id) return { outcome: "skipped: task has no monitor ref" };

  // Tenant scope belongs on the query, never on a later if-statement.
  const monitor = await prisma.intentMonitor.findFirst({
    where: { id, userId: task.userId },
  });
  if (!monitor || !monitor.active) return { outcome: "skipped: monitor is gone or inactive" };

  // A retry of an already-advanced run must not fire the monitor a second time
  // (that would spend credits twice for one cycle). The schedule column is the
  // authority on whether this cycle is still owed.
  if (monitor.nextRunAt && monitor.nextRunAt > now) {
    return { outcome: "skipped: already ran this cycle" };
  }

  // Compute the next slot up front so we can advance it whether the run
  // succeeds OR fails - a run that throws (e.g. out of credits) must still
  // push nextRunAt forward, otherwise the monitor stays "due" and gets
  // re-queried every hour until credits refill (weeks of wasted polling).
  const nextRun = nextSlot(now, monitor.frequency);

  try {
    // Run + record history (auto-adds to CRM only when the monitor says so).
    const { added, created } = await runIntentMonitorOnce(monitor);

    await prisma.intentMonitor.update({
      where: { id: monitor.id },
      data: { lastRunAt: now, nextRunAt: nextRun },
    });

    // Wake the user's agent if they registered a webhook.
    if (created.length > 0) {
      await notifyTaskWebhook(await getWebhook(monitor.userId), {
        event: "intent-monitor.completed",
        taskId: monitor.id,
        name: monitor.name,
        query: monitor.query,
        created: created.length,
        items: created,
        completedAt: now.toISOString(),
      });
    }
    return { outcome: `ran: added ${added}` };
  } catch (e) {
    // Advance the schedule anyway (don't touch lastRunAt - it didn't run), then
    // rethrow so the queue records the attempt. The re-check above makes any
    // retry a cheap no-op unless the advance itself is what failed, which is
    // exactly the case worth retrying.
    await prisma.intentMonitor
      .update({ where: { id: monitor.id }, data: { nextRunAt: nextRun } })
      .catch(() => {});
    throw e;
  }
};

// ── Research schedules ────────────────────────────────────────────────────────
// Runs Linkup (or Exa) deep research for the schedule.
// If target record specified: merges research into its notes.
// If no target: saves top sources as new entities (deduped by domain).

const researchScheduleHandler: TaskHandler = async (task, { now }) => {
  const id = refOf(task.payload);
  if (!id) return { outcome: "skipped: task has no schedule ref" };

  const schedule = await prisma.researchSchedule.findFirst({
    where: { id, userId: task.userId },
  });
  if (!schedule || !schedule.active) return { outcome: "skipped: schedule is gone or inactive" };
  if (schedule.nextRunAt && schedule.nextRunAt > now) {
    return { outcome: "skipped: already ran this cycle" };
  }

  const created: CreatedItem[] = [];
  const useLinkup = schedule.provider === "linkup" && isLinkupConfigured();
  const useExa = schedule.provider === "exa" && isExaConfigured();
  if (!useLinkup && !useExa) return { outcome: `skipped: provider ${schedule.provider} not configured` };

  // Each run consumes a deep-research call; debit before running. Out of
  // credits throws, which fails the task (retried with backoff) and leaves
  // nextRunAt untouched so the cycle is still owed - the same policy the old
  // cron had, where a failed schedule simply stayed due.
  await spendCredits(schedule.userId, "deep_research", { ref: schedule.id });

  let answer: string | undefined;
  let sources: { url: string; title?: string; snippet?: string }[] = [];

  if (useLinkup) {
    const result = schedule.depth === "deep"
      ? await linkupDeepResearch(schedule.query)
      : await linkupSearch(schedule.query);
    answer = result.answer;
    sources = result.sources;
  } else {
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

  await prisma.researchSchedule.update({
    where: { id: schedule.id },
    data: { lastRunAt: now, nextRunAt: nextSlot(now, schedule.frequency) },
  });

  if (created.length > 0) {
    await notifyTaskWebhook(await getWebhook(schedule.userId), {
      event: "research-schedule.completed",
      taskId: schedule.id,
      name: schedule.name,
      query: schedule.query,
      created: created.length,
      items: created,
      completedAt: now.toISOString(),
    });
  }

  return { outcome: `ran: ${created.length} record${created.length === 1 ? "" : "s"} touched` };
};

// ── Budgeted autopilot ────────────────────────────────────────────────────────
// Runs the plan's bounded work tick (see autopilot-run.ts), then either rolls
// its window over (still active - fresh budget, same cadence) or leaves it
// exactly as the budget guard left it (paused/exhausted mid-tick, so a human
// can see why). Advances nextRunAt whether the tick succeeds or throws, same
// policy as the intent monitors above.

const autopilotPlanHandler: TaskHandler = async (task, { now }) => {
  const id = refOf(task.payload);
  if (!id) return { outcome: "skipped: task has no plan ref" };

  const plan = await prisma.autopilotPlan.findFirst({
    where: { id, userId: task.userId },
    include: { allocations: true },
  });
  if (!plan || plan.status !== "active") return { outcome: "skipped: plan is gone or not active" };
  if (plan.nextRunAt && plan.nextRunAt > now) {
    return { outcome: "skipped: already ran this cycle" };
  }

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

    if (result.ranSteps.length > 0) {
      await notifyTaskWebhook(await getWebhook(plan.userId), {
        event: "autopilot-plan.completed",
        taskId: plan.id,
        name: plan.name,
        query: `Autopilot ${plan.cadence} run (${plan.status}): ${[...new Set(result.ranSteps)].join(", ")}.`,
        created: result.touched.length,
        items: result.touched,
        completedAt: now.toISOString(),
      });
    }
    return { outcome: `ran: ${result.ranSteps.length} step${result.ranSteps.length === 1 ? "" : "s"} (${result.status})` };
  } catch (e) {
    await prisma.autopilotPlan
      .update({ where: { id: plan.id }, data: { nextRunAt: nextRun } })
      .catch(() => {});
    throw e;
  }
};

/** Wire the built-in kinds into the dispatcher. Idempotent (the registry is a
 *  map keyed by kind), and called by every entry point that dispatches, so no
 *  entry point can accidentally run a dispatcher that knows nothing. */
export function registerCoreTaskHandlers(): void {
  registerTaskHandler(TASK_KIND.intentMonitor, intentMonitorHandler);
  registerTaskHandler(TASK_KIND.researchSchedule, researchScheduleHandler);
  registerTaskHandler(TASK_KIND.autopilotPlan, autopilotPlanHandler);
  // Feature packs register here too, so every entry point that dispatches
  // (the cron, /api/tasks/dispatch) knows every kind the product enqueues.
  registerTaskHandler(MAILBOX_INGEST_KIND, handleMailboxIngest);
  registerTaskHandler(CALENDAR_INGEST_KIND, handleCalendarIngest);
  registerSocialTaskHandlers();
  registerTaskHandler(VOICE_FOLLOW_UP_KIND, async (task) => handleVoiceFollowUp(task));
}

export interface SeedSummary {
  intentMonitors: number;
  researchSchedules: number;
  autopilotPlans: number;
}

/**
 * Turn due schedule rows into queue rows.
 *
 * This is what keeps the migration lossless: IntentMonitor.nextRunAt and
 * friends stay exactly as they were and remain the source of truth for when
 * work is owed. Seeding is safe to run as often as we like because enqueueTask
 * dedupes on (userId, kind, payload.ref) while a task is still open, so a
 * schedule that is due but not yet run never queues twice.
 */
export async function seedDueTasks(now: Date = new Date()): Promise<SeedSummary> {
  const summary: SeedSummary = { intentMonitors: 0, researchSchedules: 0, autopilotPlans: 0 };

  // Same guard the old cron had: with no Exa key there is nothing to run, so
  // don't queue work that can only fail.
  if (isExaConfigured()) {
    const monitors = await prisma.intentMonitor.findMany({
      where: { active: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: "asc" },
      take: SEED_LIMIT,
    });
    for (const m of monitors) {
      const res = await enqueueTask(m.userId, {
        kind: TASK_KIND.intentMonitor,
        reason: `Scheduled intent monitor "${m.name}" (${m.frequency}) is due to search for new signals.`,
        dueAt: m.nextRunAt ?? now,
        ref: m.id,
        cooldownMs: SEED_COOLDOWN_MS,
      }).catch((e) => { console.error("[seed] intent monitor", m.id, e); return null; });
      if (res && !res.deduped) summary.intentMonitors++;
    }
  }

  const schedules = await prisma.researchSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: SEED_LIMIT,
  });
  for (const s of schedules) {
    const res = await enqueueTask(s.userId, {
      kind: TASK_KIND.researchSchedule,
      reason: `Scheduled ${s.depth} research "${s.name}" (${s.frequency}) is due to refresh what we know.`,
      dueAt: s.nextRunAt ?? now,
      ref: s.id,
      cooldownMs: SEED_COOLDOWN_MS,
    }).catch((e) => { console.error("[seed] research schedule", s.id, e); return null; });
    if (res && !res.deduped) summary.researchSchedules++;
  }

  const plans = await prisma.autopilotPlan.findMany({
    where: { status: "active", nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: SEED_LIMIT,
  });
  for (const p of plans) {
    const res = await enqueueTask(p.userId, {
      kind: TASK_KIND.autopilotPlan,
      reason: `Autopilot plan "${p.name}" (${p.cadence}) is due for its next budgeted tick.`,
      dueAt: p.nextRunAt ?? now,
      ref: p.id,
      cooldownMs: SEED_COOLDOWN_MS,
    }).catch((e) => { console.error("[seed] autopilot plan", p.id, e); return null; });
    if (res && !res.deduped) summary.autopilotPlans++;
  }

  return summary;
}

export interface QueuePassResult extends DispatchSummary {
  seeded: SeedSummary;
}

/** One full pass: seed what has come due, then run a bounded batch of it.
 *  The single entry point for every trigger (Inngest cron, HTTP cron). */
export async function runDueTasks(now: Date = new Date()): Promise<QueuePassResult> {
  resetWebhookCache();
  registerCoreTaskHandlers();
  const seeded = await seedDueTasks(now);
  const dispatched = await dispatchTasks({ now });
  return { seeded, ...dispatched };
}

// Register at module load too, so anything that imports the Inngest functions
// (the serve handler, the HTTP trigger) has a dispatcher that knows every kind
// even before the first pass runs.
registerCoreTaskHandlers();

// ── The alarm clock ───────────────────────────────────────────────────────────
// Every five minutes rather than hourly: the batch is bounded now, so
// throughput comes from running often, not from one big sweep. Overlapping
// invocations are safe by construction (leases + SKIP LOCKED), which is
// precisely what the old hourly crons could not say.

export const runTaskQueue = inngest.createFunction(
  {
    id: "run-task-queue",
    name: "Run the agent task queue",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async () => runDueTasks(),
);

export const functions = [runTaskQueue];
