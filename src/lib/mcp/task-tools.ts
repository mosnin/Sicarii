// MCP tools over the agent task queue.
//
// The queue is not just an internal scheduler: it is how a connected agent
// keeps a promise. "I'll check back on this in two weeks" is worth nothing if
// the session ends five minutes later, so the agent writes the promise down
// here, with a reason the operator can read.
//
// Registered into the MCP server by the route (see
// src/app/api/mcp/[transport]/route.ts), which owns the auth, the ok/fail
// envelope and the rate limiter and passes them in as ctx.

import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  cancelTask,
  listOpenTasks,
  scheduleRecheck,
  MAX_ATTEMPTS,
} from "@/lib/tasks";

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export interface ToolExtra {
  authInfo?: AuthInfo;
}

export interface ToolHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** The subset of the MCP server surface these tools need: the same
 *  (name, description, zodShape, hints, handler) call the route uses. */
export interface TaskToolServer {
  tool(
    name: string,
    description: string,
    shape: z.ZodRawShape,
    hints: ToolHints,
    handler: (args: unknown, extra: ToolExtra) => Promise<ToolResult>,
  ): unknown;
}

/** The route's shared plumbing, handed in rather than re-implemented here so
 *  these tools error, rate-limit and authenticate identically to every other
 *  tool on the server. */
export interface TaskToolContext {
  /** The authenticated tenant for this session. Throws when unauthenticated. */
  userIdFrom: (extra: ToolExtra) => string;
  /** Run a tool body, turning OpErrors into clean tool errors. */
  run: (fn: () => Promise<unknown>) => Promise<ToolResult>;
  /** Like run(), plus a per-user rate limit; passes the tenant id in. */
  gated: (
    extra: ToolExtra,
    bucket: string,
    limit: number,
    fn: (userId: string) => Promise<unknown>,
  ) => Promise<ToolResult>;
}

const scheduleRecheckShape = {
  reason: z
    .string()
    .min(1)
    .max(2000)
    .describe(
      "REQUIRED. Why you are coming back, in one line. This is shown to the operator verbatim, so write it for them: \"their contract renews in March, check hiring signals then\", not \"follow up\".",
    ),
  inDays: z.number().int().min(0).max(365).optional().describe("How many days out to schedule it (default 14). Ignored when dueAt is set."),
  dueAt: z.string().datetime().optional().describe("Exact ISO timestamp to run at, instead of inDays."),
  contactId: z.string().optional().describe("The contact this recheck is about."),
  entityId: z.string().optional().describe("The business this recheck is about."),
  kind: z.string().max(60).optional().describe("Task kind (default \"recheck\")."),
  priority: z.number().int().min(0).max(100).optional().describe("Higher runs first when several tasks are due at once (default 0)."),
  budget: z.number().int().min(0).max(10000).optional().describe("Credit ceiling for this one task (default 0, meaning no dedicated budget)."),
};

const listOutstandingShape = {
  kind: z.string().max(60).optional().describe("Filter to one task kind."),
  limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 50)."),
};

const cancelTaskShape = {
  taskId: z.string().describe("The task id from list_outstanding_work."),
  reason: z.string().max(500).optional().describe("Why you are dropping it. Shown to the operator alongside the task."),
};

/** Add the queue tools to an MCP server. Called by the MCP route. */
export function registerTaskTools(server: TaskToolServer, ctx: TaskToolContext): void {
  server.tool(
    "schedule_recheck",
    "Promise to come back to a record later, durably. The queue survives this session, so use it instead of saying you'll follow up: the work is leased, retried on failure, and visible to the operator until it runs. reason is REQUIRED and is shown to the operator word for word - if you cannot say why you will be back in fourteen days, you do not have a reason, you have a default. Free; a recheck is only queued once per record while one is still outstanding.",
    scheduleRecheckShape,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (rawArgs, extra) =>
      ctx.gated(extra, "tasks", 120, async (userId) => {
        const args = z.object(scheduleRecheckShape).parse(rawArgs);
        const { task, deduped } = await scheduleRecheck(userId, {
          reason: args.reason,
          dueAt: args.dueAt ? new Date(args.dueAt) : undefined,
          inDays: args.inDays,
          contactId: args.contactId ?? null,
          entityId: args.entityId ?? null,
          kind: args.kind,
          priority: args.priority,
          budget: args.budget,
        });
        return {
          taskId: task.id,
          kind: task.kind,
          reason: task.reason,
          dueAt: task.dueAt.toISOString(),
          alreadyScheduled: deduped,
          note: deduped
            ? "An outstanding task for this record already existed; returning it instead of queuing a second one."
            : undefined,
        };
      }),
  );

  server.tool(
    "list_outstanding_work",
    "Everything you have promised to do and not yet done: queued and in-flight tasks, soonest first, with the reason you gave, when it is due, and how many attempts it has burned. Read this at the start of a session so you resume your own commitments instead of starting over. Read-only; free.",
    listOutstandingShape,
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (rawArgs, extra) =>
      ctx.run(async () => {
        const args = z.object(listOutstandingShape).parse(rawArgs);
        const userId = ctx.userIdFrom(extra);
        const tasks = await listOpenTasks(userId, { kind: args.kind, limit: args.limit });
        return {
          count: tasks.length,
          maxAttempts: MAX_ATTEMPTS,
          tasks: tasks.map((t) => ({
            id: t.id,
            kind: t.kind,
            reason: t.reason,
            dueAt: t.dueAt.toISOString(),
            priority: t.priority,
            attempts: t.attempts,
            contactId: t.contactId,
            entityId: t.entityId,
            // A live lease means a dispatcher is running it right now.
            running: !!t.leasedUntil && t.leasedUntil > new Date(),
          })),
        };
      }),
  );

  server.tool(
    "cancel_task",
    "Drop a task you queued but no longer intend to do (the deal closed, the record was merged, the question answered itself). Finishing it honestly is better than leaving it to run: the operator sees why it was cancelled. Free.",
    cancelTaskShape,
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async (rawArgs, extra) =>
      ctx.run(async () => {
        const args = z.object(cancelTaskShape).parse(rawArgs);
        const userId = ctx.userIdFrom(extra);
        return cancelTask(userId, args.taskId, args.reason);
      }),
  );
}
