// The task dispatcher: leases due work and runs it, one row at a time.
//
// The dispatcher decides nothing. It does not know what an intent monitor is,
// what a research schedule costs, or when anything should next run. It leases
// what is due, looks up the handler for the row's kind, runs exactly that one
// row inside its own try/catch, and records the result. All the judgement lives
// in the handlers (see src/inngest/functions.ts), which is what makes this file
// boring enough to trust.

import type { AgentTask, Prisma } from "@prisma/client";
import {
  claimDue,
  completeTask,
  failTask,
  releaseTask,
  retireExhausted,
  type KindFilter,
} from "@/lib/tasks";

// ── Wall-clock budgets ────────────────────────────────────────────────────────
// A Vercel function has a hard ceiling (the route sets maxDuration = 300s, and
// the platform kills the invocation at that point with no chance to write
// anything back). Every constant below exists to guarantee we stop on OUR
// terms, before the platform stops us, so no row is ever lost mid-flight.

/** Rows leased per invocation. Small on purpose: a batch is a promise to finish
 *  what you claimed, and five bounded tasks fit comfortably inside the
 *  invocation budget below. More throughput comes from running the dispatcher
 *  more often (or concurrently, which SKIP LOCKED makes safe), not from a
 *  bigger batch. */
export const DISPATCH_BATCH_SIZE = 5;

/** Hard cap on one task's wall clock. The race does not cancel the underlying
 *  provider call (fetch keeps going until its own AbortSignal fires), it caps
 *  how long the DISPATCHER waits, so one hung provider can never eat the whole
 *  invocation and strand the rest of the batch. */
export const TASK_TIMEOUT_MS = 120_000;

/** Stop starting new tasks once the invocation has been running this long.
 *  Sits below maxDuration (300s) by a full task-timeout's margin so the last
 *  task we start still has room to finish and be recorded. */
export const INVOCATION_BUDGET_MS = 150_000;

/** How long a claim holds a row. Must exceed the worst-case invocation
 *  (maxDuration) so a task that is genuinely still running is never stolen by
 *  the next dispatcher, and must be short enough that rows held by an
 *  invocation the platform killed come back on their own within minutes. */
export const LEASE_MS = 15 * 60_000;

export interface TaskRunContext {
  /** The dispatcher's clock for this invocation, so every handler in a batch
   *  agrees on "now" (the old crons relied on exactly this). */
  now: Date;
}

export interface TaskHandlerResult {
  /** One line, shown to the operator beside the task's reason. */
  outcome: string;
  payload?: Prisma.InputJsonValue;
}

export type TaskHandler = (task: AgentTask, ctx: TaskRunContext) => Promise<TaskHandlerResult>;

const handlers = new Map<string, TaskHandler>();

/** Register the handler for a task kind. Last registration wins, so a module
 *  re-evaluated by a hot reload does not double-register. */
export function registerTaskHandler(kind: string, handler: TaskHandler): void {
  handlers.set(kind, handler);
}

export function registeredKinds(): string[] {
  return [...handlers.keys()];
}

/** Test seam: drop every registration. */
export function clearTaskHandlers(): void {
  handlers.clear();
}

export interface DispatchOptions {
  limit?: number;
  kinds?: KindFilter;
  leaseMs?: number;
  taskTimeoutMs?: number;
  invocationBudgetMs?: number;
  now?: Date;
}

export interface DispatchSummary {
  claimed: number;
  completed: number;
  failed: number;
  deferred: number;
  retired: number;
  kinds: string[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded its ${Math.round(ms / 1000)}s time budget`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Lease and run one batch of due work.
 *
 * By default only kinds that actually have a handler registered are claimed:
 * a row whose handler is missing (a deploy in flight, a module not imported)
 * stays pending and visible instead of being claimed and failed five times.
 */
export async function dispatchTasks(opts: DispatchOptions = {}): Promise<DispatchSummary> {
  const now = opts.now ?? new Date();
  const startedAt = Date.now();
  const limit = opts.limit ?? DISPATCH_BATCH_SIZE;
  const leaseMs = opts.leaseMs ?? LEASE_MS;
  const taskTimeoutMs = opts.taskTimeoutMs ?? TASK_TIMEOUT_MS;
  const budgetMs = opts.invocationBudgetMs ?? INVOCATION_BUDGET_MS;
  const kinds: KindFilter = opts.kinds ?? { only: registeredKinds() };

  // Clear out anything that has spent its attempts before claiming, so those
  // rows stop being scanned by this claim and every one after it.
  const retired = await retireExhausted();

  const claimed = await claimDue(limit, kinds, leaseMs, now);
  const summary: DispatchSummary = {
    claimed: claimed.length,
    completed: 0,
    failed: 0,
    deferred: 0,
    retired,
    kinds: [...new Set(claimed.map((t) => t.kind))],
  };

  for (const task of claimed) {
    // Out of wall clock: hand the rest of the batch straight back so another
    // invocation can take them now, rather than holding leases we cannot use.
    if (Date.now() - startedAt > budgetMs) {
      summary.deferred++;
      await releaseTask(task.id, "deferred: dispatcher ran out of invocation time").catch(() => {});
      continue;
    }

    const handler = handlers.get(task.kind);
    if (!handler) {
      // Only reachable when a caller asked for kinds explicitly. Failing (not
      // finishing) is deliberate: the work is real, the code to do it is
      // missing, and a deploy should be able to rescue it.
      summary.failed++;
      await failTask(task.id, new Error(`no handler registered for kind "${task.kind}"`)).catch(() => {});
      continue;
    }

    try {
      const result = await withTimeout(handler(task, { now }), taskTimeoutMs, `task ${task.kind}`);
      await completeTask(task.id, result.outcome, { payload: result.payload });
      summary.completed++;
    } catch (e) {
      // One row's failure never touches another row: log it, release its lease
      // with a backoff, move on.
      console.error(`[dispatch] task ${task.id} (${task.kind}) failed`, e);
      summary.failed++;
      await failTask(task.id, e).catch(() => {});
    }
  }

  return summary;
}
