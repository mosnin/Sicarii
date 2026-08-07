// Tests for the SocQ client layer.
//
// What is worth asserting here is exactly what costs money or attaches data to
// the wrong person: that an idempotency key is ALWAYS sent (a retry without one
// is a second bill), that results_limit is ALWAYS bounded well under SocQ's
// 2000 ceiling, that the authoritative credits_amount is reconciled into our
// meter exactly once, that the unschematized payload is parsed without ever
// assuming a field exists, and that one tenant can never poll another's task.
//
// No live calls: the SDK is mocked. Every real call costs credits and there is
// no sandbox.

import { describe, it, expect, vi, beforeEach } from "vitest";

const socq = vi.hoisted(() => ({
  submit: vi.fn(),
  task: vi.fn(),
  catalog: vi.fn(),
}));

vi.mock("@socq/core", () => {
  class SocqApiError extends Error {
    status: number;
    detail?: unknown;
    constructor(message: string, status: number, detail?: unknown) {
      super(message);
      this.name = "SocqApiError";
      this.status = status;
      this.detail = detail;
    }
  }
  class SocqClient {
    submit = socq.submit;
    task = socq.task;
    catalog = socq.catalog;
  }
  return { SocqClient, SocqApiError };
});

const db = vi.hoisted(() => ({
  socqTaskFindFirst: vi.fn(),
  socqTaskUpsert: vi.fn(),
  socqTaskUpdate: vi.fn(),
  socqTaskUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  ledgerCreate: vi.fn(),
  agentTaskCreate: vi.fn(),
  agentTaskFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socqTask: {
      findFirst: db.socqTaskFindFirst,
      upsert: db.socqTaskUpsert,
      update: db.socqTaskUpdate,
      updateMany: db.socqTaskUpdateMany,
    },
    user: { findUnique: db.userFindUnique, update: db.userUpdate },
    creditLedger: { create: db.ledgerCreate },
    agentTask: { create: db.agentTaskCreate, findFirst: db.agentTaskFindFirst },
  },
}));

import {
  SOCQ_SERVER_MAX_RESULTS_LIMIT,
  SOCQ_RESULTS_LIMIT_CEILING,
  SOCQ_DEFAULT_RESULTS_LIMIT,
  clampResultsLimit,
  clampPageLimit,
  canonicalJson,
  idempotencyKeyFor,
  normalizeAuthor,
  normalizeItem,
  normalizeItems,
  parseCompactCount,
  scalarCreditsFor,
  socqOpError,
  pollTask,
  submitTask,
  resetSocqClient,
  mapSocqStatus,
} from "@/lib/socq";
import { OpError } from "@/lib/op-error";

const OWNER = "user-A";
const ATTACKER = "user-B";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SOCQ_API_KEY = "sk-test";
  process.env.SOCQ_ENABLED = "true";
  delete process.env.SOCQ_CREDIT_MULTIPLIER;
  resetSocqClient();

  socq.catalog.mockResolvedValue({ endpoints: { items: [] } });
  socq.submit.mockResolvedValue({ task_id: "socq-1", status: "queued" });
  db.socqTaskFindFirst.mockResolvedValue(null);
  db.socqTaskUpsert.mockResolvedValue({ id: "row-1" });
  db.socqTaskUpdate.mockResolvedValue({});
  db.socqTaskUpdateMany.mockResolvedValue({ count: 1 });
  db.userFindUnique.mockResolvedValue({ creditsRemaining: 100_000 });
  db.userUpdate.mockResolvedValue({ creditsRemaining: 99_000 });
  db.ledgerCreate.mockResolvedValue({});
});

/* ------------------------------ results_limit ---------------------------- */

describe("results_limit is always bounded", () => {
  it("never lets a caller near SocQ's 2000 ceiling", () => {
    expect(SOCQ_SERVER_MAX_RESULTS_LIMIT).toBe(2000);
    expect(clampResultsLimit(2000)).toBe(SOCQ_RESULTS_LIMIT_CEILING);
    expect(clampResultsLimit(1_000_000)).toBe(SOCQ_RESULTS_LIMIT_CEILING);
  });

  it("falls back to the small default, not the ceiling, on junk input", () => {
    expect(clampResultsLimit(undefined)).toBe(SOCQ_DEFAULT_RESULTS_LIMIT);
    expect(clampResultsLimit(null)).toBe(SOCQ_DEFAULT_RESULTS_LIMIT);
    expect(clampResultsLimit(Number.NaN)).toBe(SOCQ_DEFAULT_RESULTS_LIMIT);
    expect(clampResultsLimit(Number.POSITIVE_INFINITY)).toBe(SOCQ_DEFAULT_RESULTS_LIMIT);
  });

  it("clamps up from zero and negatives", () => {
    expect(clampResultsLimit(0)).toBe(1);
    expect(clampResultsLimit(-50)).toBe(1);
  });

  it("honours a lower per-call ceiling but never a higher one", () => {
    expect(clampResultsLimit(50, 1)).toBe(1);
    expect(clampResultsLimit(9999, 10)).toBe(10);
    expect(clampResultsLimit(9999, 100_000)).toBe(SOCQ_RESULTS_LIMIT_CEILING);
  });

  it("caps result pages at 100", () => {
    expect(clampPageLimit(5000)).toBe(100);
    expect(clampPageLimit(undefined)).toBe(50);
    expect(clampPageLimit(0)).toBe(1);
  });

  it("always sends a clamped results_limit on the wire", async () => {
    await submitTask(OWNER, {
      platform: "X",
      resource: "Search",
      input: { query: "crm" },
      purpose: "test",
      resultsLimit: 5000,
    });
    const [platform, resource, payload] = socq.submit.mock.calls[0];
    expect(platform).toBe("x");
    expect(resource).toBe("search");
    expect(payload.results_limit).toBe(SOCQ_RESULTS_LIMIT_CEILING);
  });

  it("sends results_limit even when the caller never mentions it", async () => {
    await submitTask(OWNER, {
      platform: "x",
      resource: "search",
      input: { query: "crm" },
      purpose: "test",
    });
    expect(socq.submit.mock.calls[0][2].results_limit).toBe(SOCQ_DEFAULT_RESULTS_LIMIT);
  });
});

/* ------------------------------ idempotency ------------------------------ */

describe("idempotency", () => {
  it("always sends an Idempotency-Key on submit", async () => {
    await submitTask(OWNER, {
      platform: "x",
      resource: "search",
      input: { query: "crm" },
      purpose: "test",
    });
    const options = socq.submit.mock.calls[0][3];
    expect(options).toBeTruthy();
    expect(options.idempotencyKey).toMatch(/^scalar-[0-9a-f]{48}$/);
  });

  it("derives the same key for the same question and a different one per tenant", () => {
    const a = idempotencyKeyFor(OWNER, "x", "search", { query: "crm", results_limit: 25 });
    const b = idempotencyKeyFor(OWNER, "x", "search", { results_limit: 25, query: "crm" });
    const c = idempotencyKeyFor(ATTACKER, "x", "search", { query: "crm", results_limit: 25 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("changes the key when the input changes, so a changed call is a 409 not a silent second bill", () => {
    const a = idempotencyKeyFor(OWNER, "x", "search", { query: "crm", results_limit: 25 });
    const b = idempotencyKeyFor(OWNER, "x", "search", { query: "crm", results_limit: 26 });
    expect(a).not.toBe(b);
  });

  it("canonicalises key order at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("replays our own stored submission instead of paying to ask twice", async () => {
    db.socqTaskFindFirst.mockResolvedValue({
      id: "row-existing",
      socqTaskId: "socq-existing",
      status: "RUNNING",
    });
    const result = await submitTask(OWNER, {
      platform: "x",
      resource: "search",
      input: { query: "crm" },
      purpose: "test",
    });
    expect(result.replayed).toBe(true);
    expect(result.socqTaskId).toBe("socq-existing");
    expect(socq.submit).not.toHaveBeenCalled();
  });
});

/* ------------------------- credit reconciliation ------------------------- */

describe("credit reconciliation from credits_amount", () => {
  function succeededTask(extra: Record<string, unknown> = {}) {
    return {
      task_id: "socq-1",
      status: "succeeded",
      credits_amount: 4,
      result_count: 2,
      results: { items: [], has_more: false, next_cursor: null, limit: 50 },
      ...extra,
    };
  }

  beforeEach(() => {
    db.socqTaskFindFirst.mockResolvedValue({
      id: "row-1",
      userId: OWNER,
      socqTaskId: "socq-1",
      purpose: "test",
      contactId: null,
      entityId: null,
      monitorId: null,
    });
  });

  it("debits the tenant from the amount SocQ reports, never a hardcoded price", async () => {
    socq.task.mockResolvedValue(succeededTask());
    const result = await pollTask(OWNER, "socq-1");

    expect(result.creditsAmount).toBe(4);
    // 4 SocQ credits at the default 3x margin, rounded up.
    expect(result.creditsCharged).toBe(scalarCreditsFor(4));
    expect(db.userUpdate).toHaveBeenCalledWith({
      where: { id: OWNER },
      data: { creditsRemaining: { decrement: 12 } },
      select: { creditsRemaining: true },
    });
    expect(db.ledgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: OWNER, delta: -12, action: "socq_result", ref: "socq-1" }),
    });
  });

  it("charges at most once per task, decided at the storage layer", async () => {
    socq.task.mockResolvedValue(succeededTask());
    // A second poller loses the conditional claim on creditsAmount.
    db.socqTaskUpdateMany.mockResolvedValue({ count: 0 });

    const result = await pollTask(OWNER, "socq-1");
    expect(result.creditsCharged).toBe(0);
    expect(db.userUpdate).not.toHaveBeenCalled();
    expect(db.ledgerCreate).not.toHaveBeenCalled();
  });

  it("does not charge a task that reports no cost", async () => {
    socq.task.mockResolvedValue(succeededTask({ credits_amount: undefined }));
    const result = await pollTask(OWNER, "socq-1");
    expect(result.creditsAmount).toBeNull();
    expect(result.creditsCharged).toBe(0);
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it("respects a configured margin and never rounds a real cost down to zero", () => {
    expect(scalarCreditsFor(0)).toBe(0);
    expect(scalarCreditsFor(0.1)).toBe(1);
    process.env.SOCQ_CREDIT_MULTIPLIER = "2";
    expect(scalarCreditsFor(5)).toBe(10);
    process.env.SOCQ_CREDIT_MULTIPLIER = "not-a-number";
    expect(scalarCreditsFor(5)).toBe(15);
  });
});

/* ----------------------------- userId isolation -------------------------- */

describe("userId isolation", () => {
  it("scopes the task lookup by tenant in the same query as the read", async () => {
    db.socqTaskFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.userId === OWNER
        ? { id: "row-1", userId: OWNER, socqTaskId: "socq-1", purpose: "p", contactId: null, entityId: null, monitorId: null }
        : null,
    );
    socq.task.mockResolvedValue({ task_id: "socq-1", status: "queued" });

    await expect(pollTask(ATTACKER, "socq-1")).rejects.toMatchObject({ status: 404 });
    expect(db.socqTaskFindFirst).toHaveBeenCalledWith({
      where: { socqTaskId: "socq-1", userId: ATTACKER },
    });
    // The provider was never called on the attacker's behalf.
    expect(socq.task).not.toHaveBeenCalled();
  });

  it("keys the idempotency namespace per tenant so two tenants never share a billed task", async () => {
    await submitTask(OWNER, { platform: "x", resource: "search", input: { query: "q" }, purpose: "p" });
    const ownerKey = socq.submit.mock.calls[0][3].idempotencyKey;
    socq.submit.mockClear();
    await submitTask(ATTACKER, { platform: "x", resource: "search", input: { query: "q" }, purpose: "p" });
    expect(socq.submit.mock.calls[0][3].idempotencyKey).not.toBe(ownerKey);
  });
});

/* --------------------------- defensive parsing --------------------------- */

describe("defensive parsing of an unschematized payload", () => {
  it("survives an item with no author, no metrics and no media", () => {
    const item = normalizeItem({ url: "https://x.com/a/status/1", text: "hello" });
    expect(item.url).toBe("https://x.com/a/status/1");
    expect(item.text).toBe("hello");
    expect(item.author.name).toBeNull();
    expect(item.author.followers).toBeNull();
    expect(item.metrics).toBeNull();
    expect(item.media).toBeNull();
    expect(item.publishedAt).toBeNull();
  });

  it("keeps the raw blob whatever shape arrived, so a scraper rotation loses nothing", () => {
    const raw = { url: "https://x.com/p/1", weird_new_field: { nested: [1, 2, 3] } };
    expect(normalizeItem(raw).raw).toEqual(raw);
  });

  it("does not choke when author is a string rather than an object", () => {
    const author = normalizeAuthor("@someone");
    expect(author.name).toBeNull();
    expect(author.handle).toBeNull();
    expect(author.raw).toBe("@someone");
  });

  it("does not choke when author is an array or null", () => {
    expect(normalizeAuthor(null).raw).toBeNull();
    expect(normalizeAuthor([1, 2]).name).toBeNull();
    expect(normalizeItem({ author: [] }).author.name).toBeNull();
  });

  it("refuses to invent metrics when metrics is not an object", () => {
    expect(normalizeItem({ metrics: 42 }).metrics).toBeNull();
    expect(normalizeItem({ metrics: [1, 2] }).metrics).toBeNull();
    expect(normalizeItem({ metrics: "lots" }).metrics).toBeNull();
    expect(normalizeItem({ metrics: { likes: 3 } }).metrics).toEqual({ likes: 3 });
  });

  it("reads whichever author key the scraper happened to use this week", () => {
    expect(normalizeAuthor({ full_name: "Ada Lovelace" }).name).toBe("Ada Lovelace");
    expect(normalizeAuthor({ display_name: "Ada" }).name).toBe("Ada");
    expect(normalizeAuthor({ username: "ada" }).handle).toBe("ada");
    expect(normalizeAuthor({ screen_name: "ada" }).handle).toBe("ada");
  });

  it("parses follower counts in whatever notation they arrive in", () => {
    expect(normalizeAuthor({ followers: 1234 }).followers).toBe(1234);
    expect(normalizeAuthor({ followers_count: "12.3K" }).followers).toBe(12_300);
    expect(normalizeAuthor({ followers: "1,234" }).followers).toBe(1234);
    expect(normalizeAuthor({ followers: "loads" }).followers).toBeNull();
    expect(parseCompactCount("4M")).toBe(4_000_000);
    expect(parseCompactCount("about ten")).toBeNull();
  });

  it("parses dates from ISO strings and from unix seconds or milliseconds", () => {
    expect(normalizeItem({ published_at: "2026-01-02T03:04:05Z" }).publishedAt?.toISOString()).toBe(
      "2026-01-02T03:04:05.000Z",
    );
    expect(normalizeItem({ taken_at: 1_700_000_000 }).publishedAt?.getUTCFullYear()).toBe(2023);
    expect(normalizeItem({ created_at: 1_700_000_000_000 }).publishedAt?.getUTCFullYear()).toBe(2023);
    expect(normalizeItem({ published_at: "not a date" }).publishedAt).toBeNull();
  });

  it("drops malformed entries instead of throwing on a whole page", () => {
    const items = normalizeItems([{ url: "https://a" }, null, "nope", 7, { url: "https://b" }]);
    expect(items).toHaveLength(2);
    expect(normalizeItems(undefined)).toEqual([]);
    expect(normalizeItems({ not: "an array" })).toEqual([]);
  });
});

/* ------------------------------- gating ---------------------------------- */

describe("env gating and error mapping", () => {
  it("returns a clean 501 when the key is missing", async () => {
    delete process.env.SOCQ_API_KEY;
    resetSocqClient();
    await expect(
      submitTask(OWNER, { platform: "x", resource: "search", input: {}, purpose: "p" }),
    ).rejects.toMatchObject({ status: 501 });
  });

  it("stays dormant when configured but not switched on", async () => {
    process.env.SOCQ_ENABLED = "false";
    resetSocqClient();
    await expect(
      submitTask(OWNER, { platform: "x", resource: "search", input: {}, purpose: "p" }),
    ).rejects.toMatchObject({ status: 501 });
  });

  it("maps the statuses that mean something operationally", async () => {
    const { SocqApiError } = await import("@socq/core");
    expect(socqOpError(new SocqApiError("x", 402)).status).toBe(402);
    expect(socqOpError(new SocqApiError("x", 409)).status).toBe(409);
    expect(socqOpError(new SocqApiError("x", 429, { retry_after: 30 })).message).toContain("30s");
    expect(socqOpError(new SocqApiError("x", 403)).message).toContain("allowlist");
    expect(socqOpError(new SocqApiError("x", 402)).message).toContain("Do NOT retry");
    expect(socqOpError(new Error("socket hang up"))).toBeInstanceOf(OpError);
  });

  it("treats an unknown status string as still queued rather than as done", () => {
    expect(mapSocqStatus("queued")).toBe("QUEUED");
    expect(mapSocqStatus("running")).toBe("RUNNING");
    expect(mapSocqStatus("succeeded")).toBe("SUCCEEDED");
    expect(mapSocqStatus("failed")).toBe("FAILED");
    expect(mapSocqStatus(undefined)).toBe("QUEUED");
    expect(mapSocqStatus("something-new")).toBe("QUEUED");
  });
});
