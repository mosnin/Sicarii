// The leased task queue. The claim is raw SQL, which is the one thing Prisma
// cannot typecheck for us, so this file works on two levels:
//
//   1. SHAPE. buildClaimSql is pure, so the exact statement we will send to
//      Postgres is asserted directly: SKIP LOCKED is present, the ordering is
//      right, the attempt ceiling is bound, and every caller-supplied kind
//      rides as a parameter rather than as text spliced into SQL.
//   2. SEMANTICS. A fake $queryRaw applies that statement's WHERE/ORDER/LIMIT
//      to an in-memory table, one statement at a time and indivisibly - the
//      same guarantee Postgres gives a single UPDATE ... FOR UPDATE SKIP
//      LOCKED. That is what makes "two dispatchers take disjoint work" a real
//      test rather than a comment.
//
// What still needs a live database: that Postgres actually honors SKIP LOCKED
// across two separate connections, and that the column names in the raw
// statement match the generated schema. Neither can be exercised without a
// server; everything else about the queue is covered here.

import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  id: string;
  userId: string;
  kind: string;
  contactId: string | null;
  entityId: string | null;
  reason: string;
  payload: Record<string, unknown> | null;
  priority: number;
  budget: number;
  dueAt: Date;
  leasedUntil: Date | null;
  attempts: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let rows: Row[] = [];
let created: Row[] = [];
let seq = 0;

function makeRow(over: Partial<Row> = {}): Row {
  seq++;
  return {
    id: over.id ?? `task-${seq}`,
    userId: "user-A",
    kind: "recheck",
    contactId: null,
    entityId: null,
    reason: "because",
    payload: null,
    priority: 0,
    budget: 0,
    dueAt: new Date("2026-01-01T00:00:00Z"),
    leasedUntil: null,
    attempts: 0,
    startedAt: null,
    finishedAt: null,
    outcome: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

// Minimal where-matcher covering exactly the filters the queue issues.
type Where = Record<string, unknown>;

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (cond && typeof cond === "object") {
    const c = cond as Record<string, unknown>;
    if ("gte" in c) return value instanceof Date
      ? value.getTime() >= (c.gte as Date).getTime()
      : Number(value) >= Number(c.gte);
    if ("lt" in c) return value instanceof Date
      ? value.getTime() < (c.lt as Date).getTime()
      : Number(value) < Number(c.lt);
    if ("path" in c) {
      const payload = value as Record<string, unknown> | null;
      const key = (c.path as string[])[0];
      return !!payload && payload[key] === c.equals;
    }
  }
  return value === cond;
}

function matches(row: Row, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      const any = (cond as Where[]).some((w) => matches(row, w));
      if (!any) return false;
      continue;
    }
    if (!matchField((row as unknown as Record<string, unknown>)[key], cond)) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // The claim, executed against the in-memory table. Runs to completion with
    // no await inside, which is precisely how a single Postgres statement
    // behaves under its row locks: two concurrent claims interleave between
    // statements, never inside one.
    $queryRaw: vi.fn(async (query: unknown) => {
      const { sql, values } = query as { sql: string; values: unknown[] };
      const leaseUntil = values[0] as Date;
      const now = values[1] as Date;
      const maxAttempts = Number(values[5]);
      const limit = Number(values[values.length - 1]);
      const kinds = values.slice(6, values.length - 1) as string[];
      const blocked = /AND FALSE/.test(sql);
      const negated = /kind NOT IN/.test(sql);

      const due = rows
        .filter((r) => {
          if (blocked) return false;
          if (r.finishedAt !== null) return false;
          if (r.dueAt.getTime() > now.getTime()) return false;
          if (r.leasedUntil && r.leasedUntil.getTime() >= now.getTime()) return false;
          if (r.attempts >= maxAttempts) return false;
          if (kinds.length > 0) {
            const hit = kinds.includes(r.kind);
            if (negated ? hit : !hit) return false;
          }
          return true;
        })
        .sort((a, b) => b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime())
        .slice(0, limit);

      for (const r of due) {
        r.attempts += 1;
        r.leasedUntil = leaseUntil;
        r.startedAt = r.startedAt ?? now;
        r.updatedAt = now;
      }
      return due.map((r) => ({ ...r }));
    }),
    agentTask: {
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const row = makeRow(data as Partial<Row>);
        rows.push(row);
        created.push(row);
        return { ...row };
      }),
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const hit = rows.filter((r) => matches(r, where));
        return hit.length ? { ...hit[hit.length - 1] } : null;
      }),
      findMany: vi.fn(async ({ where, take }: { where: Where; take?: number }) =>
        rows
          .filter((r) => matches(r, where))
          .sort((a, b) => b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime())
          .slice(0, take ?? 50)
          .map((r) => ({ ...r })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error("record not found");
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        const hits = rows.filter((r) => matches(r, where));
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      }),
    },
  },
}));

import {
  buildClaimSql,
  claimDue,
  completeTask,
  failTask,
  retireExhausted,
  enqueueTask,
  scheduleRecheck,
  cancelTask,
  listOpenTasks,
  MAX_ATTEMPTS,
  RETIRED_OUTCOME,
} from "@/lib/tasks";
import { dispatchTasks, registerTaskHandler, clearTaskHandlers } from "@/lib/dispatch";
import { OpError } from "@/lib/op-error";

const NOW = new Date("2026-03-01T12:00:00Z");
const PAST = new Date("2026-02-01T00:00:00Z");

beforeEach(() => {
  rows = [];
  created = [];
  seq = 0;
  vi.clearAllMocks();
});

describe("claim statement shape", () => {
  it("leases with FOR UPDATE SKIP LOCKED, ordered by priority then due date", () => {
    const sql = buildClaimSql({ limit: 5, leaseMs: 60_000, now: NOW }).sql;
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain('ORDER BY priority DESC, "dueAt" ASC');
    expect(sql).toContain('"finishedAt" IS NULL');
    expect(sql).toContain('"leasedUntil" IS NULL OR "leasedUntil" <');
    // The attempt ceiling, the lease stamp and the attempt increment all ride
    // in the SAME statement as the claim - that is what makes a claim atomic.
    expect(sql).toContain("attempts <");
    expect(sql).toContain("attempts = t.attempts + 1");
    expect(sql).toContain('"leasedUntil" =');
  });

  it("binds the attempt ceiling, the lease deadline and the limit as parameters", () => {
    const q = buildClaimSql({ limit: 7, leaseMs: 60_000, now: NOW });
    expect(q.values[0]).toEqual(new Date(NOW.getTime() + 60_000));
    expect(q.values[5]).toBe(MAX_ATTEMPTS);
    expect(q.values[q.values.length - 1]).toBe(7);
  });

  it("filters kinds with only / except, and claims nothing for an empty allow-list", () => {
    expect(buildClaimSql({ limit: 1, leaseMs: 1, kinds: { only: ["a", "b"] } }).sql).toContain("AND kind IN");
    expect(buildClaimSql({ limit: 1, leaseMs: 1, kinds: { except: ["a"] } }).sql).toContain("AND kind NOT IN");
    // An explicit empty allow-list means "nothing", never "everything".
    expect(buildClaimSql({ limit: 1, leaseMs: 1, kinds: { only: [] } }).sql).toContain("AND FALSE");
    // An empty exclusion list is simply no filter at all.
    expect(buildClaimSql({ limit: 1, leaseMs: 1, kinds: { except: [] } }).sql).not.toContain("kind NOT IN");
  });

  it("never splices a kind into the SQL text", () => {
    const nasty = "recheck'; DROP TABLE agent_tasks; --";
    const q = buildClaimSql({ limit: 1, leaseMs: 1, kinds: { only: [nasty] } });
    expect(q.sql).not.toContain("DROP TABLE");
    expect(q.values).toContain(nasty);
  });
});

describe("lease exclusivity", () => {
  it("gives two concurrent dispatchers disjoint work", async () => {
    for (let i = 0; i < 6; i++) rows.push(makeRow({ id: `t${i}`, dueAt: PAST }));

    const [a, b] = await Promise.all([
      claimDue(3, undefined, 60_000, NOW),
      claimDue(3, undefined, 60_000, NOW),
    ]);

    const idsA = a.map((t) => t.id);
    const idsB = b.map((t) => t.id);
    expect(idsA).toHaveLength(3);
    expect(idsB).toHaveLength(3);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    expect(new Set([...idsA, ...idsB]).size).toBe(6);
    // Every row was claimed exactly once, so nothing can be double-charged.
    expect(rows.every((r) => r.attempts === 1)).toBe(true);
  });

  it("will not re-claim a row while its lease is live", async () => {
    rows.push(makeRow({ id: "t1", dueAt: PAST }));
    expect(await claimDue(5, undefined, 60_000, NOW)).toHaveLength(1);
    expect(await claimDue(5, undefined, 60_000, new Date(NOW.getTime() + 30_000))).toHaveLength(0);
  });

  it("frees a row when its lease expires, so a dispatcher that died loses nothing", async () => {
    rows.push(makeRow({ id: "t1", dueAt: PAST }));
    await claimDue(5, undefined, 60_000, NOW);

    const afterExpiry = new Date(NOW.getTime() + 61_000);
    const again = await claimDue(5, undefined, 60_000, afterExpiry);
    expect(again.map((t) => t.id)).toEqual(["t1"]);
    // The second claim is a second attempt, and startedAt still records the
    // first time anyone picked it up.
    expect(rows[0].attempts).toBe(2);
    expect(rows[0].startedAt).toEqual(NOW);
  });

  it("honors the kind filter when claiming", async () => {
    rows.push(makeRow({ id: "m1", kind: "intent_monitor", dueAt: PAST }));
    rows.push(makeRow({ id: "r1", kind: "research_schedule", dueAt: PAST }));

    const only = await claimDue(5, { only: ["intent_monitor"] }, 60_000, NOW);
    expect(only.map((t) => t.id)).toEqual(["m1"]);

    const except = await claimDue(5, { except: ["intent_monitor"] }, 60_000, NOW);
    expect(except.map((t) => t.id)).toEqual(["r1"]);
  });

  it("claims the highest priority first, then the longest overdue", async () => {
    rows.push(makeRow({ id: "low", priority: 0, dueAt: new Date("2026-01-01T00:00:00Z") }));
    rows.push(makeRow({ id: "high", priority: 5, dueAt: new Date("2026-02-20T00:00:00Z") }));
    expect((await claimDue(1, undefined, 60_000, NOW)).map((t) => t.id)).toEqual(["high"]);
  });
});

describe("attempts, failure and retirement", () => {
  it("releases the lease on failure and backs the row off before retrying", async () => {
    rows.push(makeRow({ id: "t1", dueAt: PAST }));
    await claimDue(5, undefined, 60_000, NOW);

    await failTask("t1", new Error("provider exploded"));
    expect(rows[0].leasedUntil).toBeNull();
    expect(rows[0].outcome).toContain("provider exploded");
    expect(rows[0].finishedAt).toBeNull();
    // Backed off, so one broken row cannot burn every attempt in one pass.
    expect(rows[0].dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("finishes a completed row so nothing can re-claim it", async () => {
    rows.push(makeRow({ id: "t1", dueAt: PAST }));
    await claimDue(5, undefined, 60_000, NOW);
    await completeTask("t1", "ran: added 3");

    expect(rows[0].finishedAt).not.toBeNull();
    expect(rows[0].leasedUntil).toBeNull();
    expect(rows[0].outcome).toBe("ran: added 3");
    expect(await claimDue(5, undefined, 60_000, new Date(NOW.getTime() + 3_600_000))).toHaveLength(0);
  });

  it("stops claiming a row once it has spent its attempts, and retires it", async () => {
    rows.push(makeRow({ id: "t1", dueAt: PAST, attempts: MAX_ATTEMPTS }));
    expect(await claimDue(5, undefined, 60_000, NOW)).toHaveLength(0);

    expect(await retireExhausted()).toBe(1);
    expect(rows[0].finishedAt).not.toBeNull();
    expect(rows[0].outcome).toBe(RETIRED_OUTCOME);
  });

  it("never retires a row another dispatcher is still holding", async () => {
    rows.push(makeRow({ id: "t1", dueAt: PAST, attempts: MAX_ATTEMPTS, leasedUntil: new Date(Date.now() + 60_000) }));
    expect(await retireExhausted()).toBe(0);
    expect(rows[0].finishedAt).toBeNull();
  });
});

describe("enqueueing", () => {
  it("refuses a task with no reason", async () => {
    await expect(enqueueTask("user-A", { kind: "recheck", reason: "" })).rejects.toBeInstanceOf(OpError);
    await expect(enqueueTask("user-A", { kind: "recheck", reason: "   " })).rejects.toMatchObject({ status: 400 });
    // Nothing was written on the way to refusing.
    expect(created).toHaveLength(0);
  });

  it("keeps the reason the agent wrote, trimmed", async () => {
    const { task } = await enqueueTask("user-A", {
      kind: "recheck",
      reason: "  their contract renews in March, check hiring signals then  ",
      contactId: "c1",
    });
    expect(task.reason).toBe("their contract renews in March, check hiring signals then");
  });

  it("does not queue the same work twice while one copy is still open", async () => {
    const first = await enqueueTask("user-A", { kind: "recheck", reason: "renewal", contactId: "c1" });
    const second = await enqueueTask("user-A", { kind: "recheck", reason: "renewal again", contactId: "c1" });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.task.id).toBe(first.task.id);
    expect(created).toHaveLength(1);
  });

  it("queues again once the open copy has finished", async () => {
    const first = await enqueueTask("user-A", { kind: "recheck", reason: "renewal", contactId: "c1" });
    await completeTask(first.task.id, "done");
    const second = await enqueueTask("user-A", { kind: "recheck", reason: "renewal", contactId: "c1" });
    expect(second.deduped).toBe(false);
    expect(created).toHaveLength(2);
  });

  it("holds a re-queue back during a cooldown, so a broken target cannot hot-loop", async () => {
    const first = await enqueueTask("user-A", { kind: "intent_monitor", reason: "due", ref: "mon-1" });
    await completeTask(first.task.id, "error: out of credits");
    const second = await enqueueTask("user-A", {
      kind: "intent_monitor",
      reason: "due",
      ref: "mon-1",
      cooldownMs: 30 * 60_000,
    });
    expect(second.deduped).toBe(true);
    expect(created).toHaveLength(1);
  });

  it("dedupes schedule work by its payload ref", async () => {
    await enqueueTask("user-A", { kind: "intent_monitor", reason: "monitor due", ref: "mon-1" });
    const again = await enqueueTask("user-A", { kind: "intent_monitor", reason: "monitor due", ref: "mon-1" });
    const other = await enqueueTask("user-A", { kind: "intent_monitor", reason: "other monitor due", ref: "mon-2" });

    expect(again.deduped).toBe(true);
    expect(other.deduped).toBe(false);
    expect(created[0].payload).toMatchObject({ ref: "mon-1" });
  });

  it("schedules a recheck a default fourteen days out", async () => {
    const { task } = await scheduleRecheck("user-A", { reason: "check funding news", entityId: "e1" });
    const days = (task.dueAt.getTime() - Date.now()) / (24 * 60 * 60_000);
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    expect(task.kind).toBe("recheck");
  });
});

describe("the dispatcher", () => {
  beforeEach(() => clearTaskHandlers());

  it("runs each row in its own try/catch, so one failure never touches another", async () => {
    registerTaskHandler("good", async () => ({ outcome: "ran: fine" }));
    registerTaskHandler("bad", async () => { throw new Error("provider exploded"); });
    rows.push(makeRow({ id: "g1", kind: "good", dueAt: PAST }));
    rows.push(makeRow({ id: "b1", kind: "bad", dueAt: PAST }));

    const summary = await dispatchTasks({ now: NOW });

    expect(summary.claimed).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
    const good = rows.find((r) => r.id === "g1")!;
    const bad = rows.find((r) => r.id === "b1")!;
    expect(good.finishedAt).not.toBeNull();
    expect(good.outcome).toBe("ran: fine");
    // The failure is recorded and released for retry, not finished.
    expect(bad.finishedAt).toBeNull();
    expect(bad.leasedUntil).toBeNull();
    expect(bad.outcome).toContain("provider exploded");
  });

  it("does not claim a kind it has no handler for", async () => {
    registerTaskHandler("good", async () => ({ outcome: "ran" }));
    rows.push(makeRow({ id: "x1", kind: "unknown_kind", dueAt: PAST }));

    const summary = await dispatchTasks({ now: NOW });
    expect(summary.claimed).toBe(0);
    // Left pending and visible rather than claimed and failed five times.
    expect(rows[0].attempts).toBe(0);
    expect(rows[0].finishedAt).toBeNull();
  });

  it("bounds a hung task instead of letting it eat the invocation", async () => {
    registerTaskHandler("hang", () => new Promise(() => {}));
    rows.push(makeRow({ id: "h1", kind: "hang", dueAt: PAST }));

    const summary = await dispatchTasks({ now: NOW, taskTimeoutMs: 20 });
    expect(summary.failed).toBe(1);
    expect(rows[0].outcome).toContain("time budget");
  });

  it("hands back rows it has no time left to run", async () => {
    registerTaskHandler("slow", async () => ({ outcome: "ran" }));
    rows.push(makeRow({ id: "s1", kind: "slow", dueAt: PAST }));
    rows.push(makeRow({ id: "s2", kind: "slow", dueAt: PAST }));

    // A zero-millisecond budget is spent the moment the first row is examined.
    const summary = await dispatchTasks({ now: NOW, invocationBudgetMs: -1 });
    expect(summary.deferred).toBe(2);
    // Deferred means available again immediately, not lost and not finished.
    expect(rows.every((r) => r.leasedUntil === null && r.finishedAt === null)).toBe(true);
  });
});

describe("tenant isolation", () => {
  it("treats the same target under two tenants as two separate tasks", async () => {
    const a = await enqueueTask("user-A", { kind: "recheck", reason: "renewal", contactId: "c1" });
    const b = await enqueueTask("user-B", { kind: "recheck", reason: "renewal", contactId: "c1" });
    expect(b.deduped).toBe(false);
    expect(b.task.id).not.toBe(a.task.id);
    expect(created).toHaveLength(2);
  });

  it("only lists the caller's own outstanding work", async () => {
    rows.push(makeRow({ id: "a1", userId: "user-A" }));
    rows.push(makeRow({ id: "b1", userId: "user-B" }));
    rows.push(makeRow({ id: "a2", userId: "user-A", finishedAt: new Date() }));

    const mine = await listOpenTasks("user-A");
    expect(mine.map((t) => t.id)).toEqual(["a1"]);
  });

  it("will not let one tenant cancel another tenant's task", async () => {
    rows.push(makeRow({ id: "a1", userId: "user-A" }));

    await expect(cancelTask("user-B", "a1")).rejects.toMatchObject({ status: 404 });
    // The victim's row is untouched: still open, still no outcome.
    expect(rows[0].finishedAt).toBeNull();
    expect(rows[0].outcome).toBeNull();

    await cancelTask("user-A", "a1", "deal closed");
    expect(rows[0].finishedAt).not.toBeNull();
    expect(rows[0].outcome).toBe("cancelled: deal closed");
  });
});
