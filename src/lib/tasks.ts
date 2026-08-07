// The agent task queue: durable, leased units of work over the AgentTask model.
//
// Why a queue and not a cron that scans tables: the old hourly crons selected
// every due row for every user and ran them in one serial loop. Two overlapping
// invocations both selected the same rows and ran them twice (double-charging
// credits), one slow row starved the tail of the list, and a function timeout
// dropped that tail silently with nothing to retry.
//
// A leased queue fixes all three at the storage layer:
//   - claimDue takes rows with FOR UPDATE SKIP LOCKED, so two dispatchers
//     running at once take DISJOINT work instead of colliding.
//   - the lease is a deadline, not a flag: a dispatcher that dies mid-run frees
//     its rows automatically when leasedUntil passes, with no janitor process.
//   - attempts is stamped in the same statement as the claim, so a permanently
//     failing row is retried a bounded number of times and then retired.

import { Prisma, type AgentTask } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";

/** How many times a row may be claimed before it is retired unfinished. Five
 *  is enough to ride out a provider blip or a deploy, few enough that a row
 *  which is broken forever stops costing us scans within the hour. */
export const MAX_ATTEMPTS = 5;

/** Backoff before a failed row becomes due again: 1 min, doubling, capped at
 *  an hour. Without it a failed row is instantly due again and burns all five
 *  attempts inside a single dispatcher invocation. */
const RETRY_BASE_MS = 60_000;
const RETRY_CAP_MS = 60 * 60_000;

/** Outcome written when a row runs out of attempts. Rows carrying it are
 *  finished, so the claim query stops scanning them forever. */
export const RETIRED_OUTCOME = "retired: max attempts reached";

/** Outcome strings are shown to the operator next to the reason; keep them
 *  short enough to read at a glance in a list. */
const MAX_OUTCOME_LENGTH = 500;
const MAX_REASON_LENGTH = 2000;

/** Restrict a claim to some kinds, or exclude some. `only: []` claims nothing
 *  (an empty allow-list is a real answer, not "no filter"); `except: []` is
 *  the same as no filter at all. */
export type KindFilter = { only: string[] } | { except: string[] };

export interface ClaimParams {
  limit: number;
  leaseMs: number;
  kinds?: KindFilter;
  now?: Date;
  maxAttempts?: number;
}

/**
 * The claim statement. Kept exported and pure so its shape can be asserted in
 * tests without a database (raw SQL is the one thing Prisma cannot typecheck
 * for us).
 *
 * Bound parameter order, relied on by tests/tasks.test.ts:
 *   [0] leaseUntil, [1] now (startedAt), [2] now (updatedAt), [3] now (dueAt),
 *   [4] now (leasedUntil), [5] maxAttempts, [6..n-2] kinds, [n-1] limit.
 *
 * Everything caller-supplied rides as a bound value: kind lists go through
 * Prisma.join so a kind string can never become SQL.
 */
export function buildClaimSql(params: ClaimParams): Prisma.Sql {
  const now = params.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + params.leaseMs);
  const maxAttempts = params.maxAttempts ?? MAX_ATTEMPTS;

  return Prisma.sql`
    UPDATE agent_tasks AS t
    SET attempts = t.attempts + 1,
        "leasedUntil" = ${leaseUntil},
        "startedAt" = COALESCE(t."startedAt", ${now}),
        "updatedAt" = ${now}
    FROM (
      SELECT id FROM agent_tasks
      WHERE "finishedAt" IS NULL
        AND "dueAt" <= ${now}
        AND ("leasedUntil" IS NULL OR "leasedUntil" < ${now})
        AND attempts < ${maxAttempts}
        ${kindFilterSql(params.kinds)}
      ORDER BY priority DESC, "dueAt" ASC
      LIMIT ${params.limit}
      FOR UPDATE SKIP LOCKED
    ) AS due
    WHERE t.id = due.id
    RETURNING t.id, t."userId", t.kind, t."contactId", t."entityId", t.reason,
              t.payload, t.priority, t.budget, t."dueAt", t."leasedUntil",
              t.attempts, t."startedAt", t."finishedAt", t.outcome,
              t."createdAt", t."updatedAt"
  `;
}

function kindFilterSql(kinds?: KindFilter): Prisma.Sql {
  if (!kinds) return Prisma.empty;
  if ("only" in kinds) {
    // An explicit empty allow-list means "claim nothing", not "claim anything".
    if (kinds.only.length === 0) return Prisma.sql`AND FALSE`;
    return Prisma.sql`AND kind IN (${Prisma.join(kinds.only)})`;
  }
  if (kinds.except.length === 0) return Prisma.empty;
  return Prisma.sql`AND kind NOT IN (${Prisma.join(kinds.except)})`;
}

/**
 * Lease up to `limit` due rows for this dispatcher, highest priority and
 * oldest due date first. SKIP LOCKED is what makes concurrent dispatchers safe:
 * a row already locked by another claim is skipped rather than waited on, so
 * two invocations never hand back the same task and neither blocks.
 */
export async function claimDue(
  limit: number,
  kinds?: KindFilter,
  leaseMs = 10 * 60_000,
  now: Date = new Date(),
): Promise<AgentTask[]> {
  if (limit <= 0) return [];
  return prisma.$queryRaw<AgentTask[]>(buildClaimSql({ limit, kinds, leaseMs, now }));
}

/** Finish a row for good. Clears the lease so nothing can re-claim it and
 *  stamps what happened, which is what the operator reads in the task list. */
export async function completeTask(
  taskId: string,
  outcome: string,
  opts?: { payload?: Prisma.InputJsonValue },
): Promise<void> {
  await prisma.agentTask.update({
    where: { id: taskId },
    data: {
      finishedAt: new Date(),
      leasedUntil: null,
      outcome: outcome.slice(0, MAX_OUTCOME_LENGTH),
      ...(opts?.payload !== undefined ? { payload: opts.payload } : {}),
    },
  });
}

/**
 * Record a failed attempt and release the lease so the row can be retried.
 * The row is pushed out by an exponential backoff instead of becoming due
 * immediately, otherwise one broken task spends its whole attempt budget
 * inside a single invocation and never gets the chance to recover.
 */
export async function failTask(taskId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const task = await prisma.agentTask.findUnique({
    where: { id: taskId },
    select: { attempts: true },
  });
  const attempts = task?.attempts ?? 1;
  const backoff = Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_CAP_MS);

  await prisma.agentTask.update({
    where: { id: taskId },
    data: {
      leasedUntil: null,
      dueAt: new Date(Date.now() + backoff),
      outcome: `error: ${message}`.slice(0, MAX_OUTCOME_LENGTH),
    },
  });
}

/**
 * Hand a leased row back untouched, without burning the schedule: the lease is
 * cleared so the next dispatcher can take it right away instead of waiting out
 * the lease. Used when an invocation runs out of wall clock before it can start
 * a task it already claimed. The attempt it consumed still counts, which is
 * honest: something did try to hold this row.
 */
export async function releaseTask(taskId: string, note: string): Promise<void> {
  await prisma.agentTask.update({
    where: { id: taskId },
    data: { leasedUntil: null, outcome: note.slice(0, MAX_OUTCOME_LENGTH) },
  });
}

/**
 * Finish every row that has burned through its attempts. Retiring is not
 * cosmetic: an unfinished row is scanned by every claim forever, so a handful
 * of permanently broken rows would otherwise sit at the head of the index and
 * slow every dispatch. Returns how many were retired.
 */
export async function retireExhausted(maxAttempts = MAX_ATTEMPTS): Promise<number> {
  const now = new Date();
  const res = await prisma.agentTask.updateMany({
    where: {
      finishedAt: null,
      attempts: { gte: maxAttempts },
      // Never retire a row another dispatcher is actively holding.
      OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
    },
    data: { finishedAt: now, leasedUntil: null, outcome: RETIRED_OUTCOME },
  });
  return res.count;
}

export interface EnqueueInput {
  kind: string;
  reason: string;
  dueAt?: Date;
  priority?: number;
  budget?: number;
  contactId?: string | null;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
  /** Stable identifier of the thing this task is about when it is not a
   *  contact or entity (a monitor id, a schedule id). Stored on the payload
   *  and used by the dedupe guard. */
  ref?: string;
  /** Also refuse to enqueue when a task for the same target FINISHED this
   *  recently. Without it, a target that fails permanently is re-queued the
   *  moment its last task retires, and a five-minute sweep turns into a hot
   *  loop. Zero (the default) checks open tasks only. */
  cooldownMs?: number;
}

export interface EnqueueResult {
  task: AgentTask;
  /** True when a task for the same target already existed (still open, or
   *  finished inside the cooldown) and was returned instead of creating a
   *  second one. */
  deduped: boolean;
}

/** The reason is a product rule, not a validation nicety: it is shown to the
 *  operator verbatim. An agent that cannot say why it will be back in fourteen
 *  days does not have a reason, it has a default. */
function requireReason(reason: string | undefined | null): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) {
    throw new OpError(
      "reason is required: say in one line why this task exists. The operator reads it.",
      400,
    );
  }
  return trimmed.slice(0, MAX_REASON_LENGTH);
}

/**
 * Find an existing task for the same target, so the same work is not queued
 * twice while one copy is still outstanding (or, with a cooldown, while one
 * has only just stopped being outstanding). Targets are identified by contact,
 * entity, or a payload ref, in that order of specificity.
 */
async function findDuplicate(
  userId: string,
  kind: string,
  target: { contactId?: string | null; entityId?: string | null; ref?: string },
  cooldownMs = 0,
): Promise<AgentTask | null> {
  // A kind with no target at all (e.g. a one-off sweep) is not deduped: there
  // is nothing to compare it against beyond its kind, and refusing a second
  // one would silently drop real work.
  if (!target.contactId && !target.entityId && !target.ref) return null;

  const where: Prisma.AgentTaskWhereInput = { userId, kind };
  if (target.contactId) where.contactId = target.contactId;
  if (target.entityId) where.entityId = target.entityId;
  if (target.ref) where.payload = { path: ["ref"], equals: target.ref };
  where.OR =
    cooldownMs > 0
      ? [{ finishedAt: null }, { finishedAt: { gte: new Date(Date.now() - cooldownMs) } }]
      : [{ finishedAt: null }];

  return prisma.agentTask.findFirst({ where, orderBy: { createdAt: "desc" } });
}

/** Put one unit of work on the queue for this user. */
export async function enqueueTask(userId: string, input: EnqueueInput): Promise<EnqueueResult> {
  const reason = requireReason(input.reason);
  const kind = input.kind?.trim();
  if (!kind) throw new OpError("kind is required.", 400);

  const existing = await findDuplicate(
    userId,
    kind,
    { contactId: input.contactId, entityId: input.entityId, ref: input.ref },
    input.cooldownMs,
  );
  if (existing) return { task: existing, deduped: true };

  const payload = input.ref
    ? ({ ...(asObject(input.payload) ?? {}), ref: input.ref } as Prisma.InputJsonValue)
    : input.payload;

  const task = await prisma.agentTask.create({
    data: {
      userId,
      kind,
      reason,
      dueAt: input.dueAt ?? new Date(),
      priority: input.priority ?? 0,
      budget: input.budget ?? 0,
      contactId: input.contactId ?? null,
      entityId: input.entityId ?? null,
      ...(payload !== undefined ? { payload } : {}),
    },
  });
  return { task, deduped: false };
}

function asObject(value: Prisma.InputJsonValue | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export interface RecheckInput {
  reason: string;
  /** When to come back. Either an explicit date or a number of days out. */
  dueAt?: Date;
  inDays?: number;
  contactId?: string | null;
  entityId?: string | null;
  kind?: string;
  priority?: number;
  budget?: number;
  payload?: Prisma.InputJsonValue;
}

/** Come back to this record later. The default kind is "recheck"; the reason
 *  is mandatory for the same product reason as enqueueTask. */
export async function scheduleRecheck(userId: string, input: RecheckInput): Promise<EnqueueResult> {
  const dueAt =
    input.dueAt ??
    new Date(Date.now() + Math.max(input.inDays ?? 14, 0) * 24 * 60 * 60_000);
  return enqueueTask(userId, {
    kind: input.kind?.trim() || "recheck",
    reason: input.reason,
    dueAt,
    priority: input.priority ?? 0,
    budget: input.budget ?? 0,
    contactId: input.contactId ?? null,
    entityId: input.entityId ?? null,
    payload: input.payload,
  });
}

/** This user's outstanding work, soonest first. Read-only and userId-scoped. */
export async function listOpenTasks(
  userId: string,
  opts?: { kind?: string; limit?: number },
): Promise<AgentTask[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  return prisma.agentTask.findMany({
    where: { userId, finishedAt: null, ...(opts?.kind ? { kind: opts.kind } : {}) },
    orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
    take: limit,
  });
}

/** Cancel one of this user's open tasks. Scoped by userId in the same
 *  statement as the write, so another tenant's row can never be reached. */
export async function cancelTask(
  userId: string,
  taskId: string,
  reason?: string,
): Promise<{ id: string; outcome: string }> {
  const outcome = `cancelled${reason?.trim() ? `: ${reason.trim()}` : ""}`.slice(0, MAX_OUTCOME_LENGTH);
  const res = await prisma.agentTask.updateMany({
    where: { id: taskId, userId, finishedAt: null },
    data: { finishedAt: new Date(), leasedUntil: null, outcome },
  });
  if (res.count === 0) throw new OpError("Task not found, or it already finished.", 404);
  return { id: taskId, outcome };
}
