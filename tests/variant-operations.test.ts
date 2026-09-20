// variant-operations.ts: tenant isolation, variant creation/selection, reply
// attribution correctness, and the winning/reply-rate stats grouping. Prisma
// is mocked (same pattern as tests/ops-isolation.test.ts and
// tests/enum-normalization.test.ts) so this exercises real ops-layer logic
// without a database.

import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

const outreachVariantFindUnique = vi.fn();
const outreachVariantFindMany = vi.fn();
const outreachVariantCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "v-new", sends: 0, replies: 0, active: true, ...args.data }),
);
const outreachVariantUpdate = vi.fn();
const segmentFindUnique = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    outreachVariant: {
      findUnique: (args: unknown) => outreachVariantFindUnique(args),
      findMany: (args: unknown) => outreachVariantFindMany(args),
      create: (args: { data: Record<string, unknown> }) => outreachVariantCreate(args),
      update: (args: unknown) => outreachVariantUpdate(args),
    },
    segment: {
      findUnique: (args: unknown) => segmentFindUnique(args),
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import {
  assertVariantOwned,
  createVariant,
  selectVariant,
  listVariantStats,
  attributeReply,
} from "@/lib/variant-operations";

beforeEach(() => {
  outreachVariantFindUnique.mockReset();
  outreachVariantFindMany.mockReset();
  outreachVariantCreate.mockClear();
  outreachVariantUpdate.mockReset();
  segmentFindUnique.mockReset();
  queryRaw.mockReset();
});

/* ------------------------------ Tenant isolation ------------------------------ */

describe("tenant isolation", () => {
  it("assertVariantOwned denies a non-owner", async () => {
    outreachVariantFindUnique.mockResolvedValue({ id: "v1", userId: OWNER });
    await expect(assertVariantOwned(ATTACKER, "v1")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
  });

  it("assertVariantOwned allows the real owner", async () => {
    outreachVariantFindUnique.mockResolvedValue({ id: "v1", userId: OWNER });
    await expect(assertVariantOwned(OWNER, "v1")).resolves.toBeUndefined();
  });

  it("assertVariantOwned denies when the variant does not exist", async () => {
    outreachVariantFindUnique.mockResolvedValue(null);
    await expect(assertVariantOwned(OWNER, "missing")).rejects.toMatchObject({ status: 400 });
  });

  it("createVariant with a segmentId owned by someone else is denied and never creates a row", async () => {
    segmentFindUnique.mockResolvedValue({ id: "s1", userId: OWNER });
    await expect(
      createVariant(ATTACKER, { kind: "SUBJECT", text: "hi", segmentId: "s1" }),
    ).rejects.toMatchObject({ name: "OpError", status: 400 });
    expect(outreachVariantCreate).not.toHaveBeenCalled();
  });

  it("createVariant succeeds for the segment's real owner", async () => {
    segmentFindUnique.mockResolvedValue({ id: "s1", userId: OWNER });
    const v = await createVariant(OWNER, { kind: "SUBJECT", text: "Quick question", segmentId: "s1" });
    expect(v).toMatchObject({ segmentId: "s1", kind: "SUBJECT", text: "Quick question" });
  });

  it("selectVariant only ever queries with the caller's own userId", async () => {
    outreachVariantFindMany.mockResolvedValue([
      { id: "v1", text: "A", kind: "SUBJECT", segmentId: null, sends: 0, replies: 0 },
    ]);
    await selectVariant(OWNER, { kind: "SUBJECT" });
    const where = outreachVariantFindMany.mock.calls[0][0].where as { userId: string };
    expect(where.userId).toBe(OWNER);
  });

  it("listVariantStats only ever queries with the caller's own userId", async () => {
    outreachVariantFindMany.mockResolvedValue([]);
    await listVariantStats(ATTACKER);
    const where = outreachVariantFindMany.mock.calls[0][0].where as { userId: string };
    expect(where.userId).toBe(ATTACKER);
  });
});

/* -------------------------------- createVariant -------------------------------- */

describe("createVariant", () => {
  it("rejects an invalid kind", async () => {
    await expect(
      createVariant(OWNER, { kind: "FOO" as unknown as "SUBJECT", text: "x" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(outreachVariantCreate).not.toHaveBeenCalled();
  });

  it("rejects empty text", async () => {
    await expect(createVariant(OWNER, { kind: "OPENER", text: "   " })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("creates a general (no-segment) variant when segmentId is omitted", async () => {
    const v = await createVariant(OWNER, { kind: "OPENER", text: "Loved your launch post" });
    expect(segmentFindUnique).not.toHaveBeenCalled();
    expect(v).toMatchObject({ segmentId: null, kind: "OPENER" });
  });
});

/* -------------------------------- selectVariant -------------------------------- */

describe("selectVariant", () => {
  it("throws a clear, actionable error when the pool is empty", async () => {
    outreachVariantFindMany.mockResolvedValue([]);
    await expect(selectVariant(OWNER, { kind: "SUBJECT", segmentId: "s1" })).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    await expect(selectVariant(OWNER, { kind: "SUBJECT", segmentId: "s1" })).rejects.toThrow(
      /create_variant/i,
    );
  });

  it("only selects from ACTIVE variants matching kind and segment exactly", async () => {
    outreachVariantFindMany.mockResolvedValue([
      { id: "v1", text: "A", kind: "SUBJECT", segmentId: "s1", sends: 0, replies: 0 },
    ]);
    await selectVariant(OWNER, { kind: "SUBJECT", segmentId: "s1" });
    const where = outreachVariantFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ kind: "SUBJECT", segmentId: "s1", active: true });
  });

  it("the general pool (no segmentId) queries segmentId: null, not 'any segment'", async () => {
    outreachVariantFindMany.mockResolvedValue([
      { id: "v1", text: "A", kind: "OPENER", segmentId: null, sends: 0, replies: 0 },
    ]);
    await selectVariant(OWNER, { kind: "OPENER" });
    const where = outreachVariantFindMany.mock.calls[0][0].where;
    expect(where.segmentId).toBeNull();
  });

  it("with a single candidate, always returns that candidate (deterministic regardless of rng)", async () => {
    outreachVariantFindMany.mockResolvedValue([
      { id: "only", text: "Hi there", kind: "SUBJECT", segmentId: null, sends: 5, replies: 1 },
    ]);
    const picked = await selectVariant(OWNER, { kind: "SUBJECT" }, () => 0.5);
    expect(picked.id).toBe("only");
    expect(picked.text).toBe("Hi there");
  });

  it("with an injected rng, deterministically picks the arm whose sample wins (verifies real wiring, not a mock)", async () => {
    outreachVariantFindMany.mockResolvedValue([
      { id: "lo", text: "lo", kind: "SUBJECT", segmentId: null, sends: 100, replies: 5 }, // low reply rate
      { id: "hi", text: "hi", kind: "SUBJECT", segmentId: null, sends: 100, replies: 90 }, // high reply rate
    ]);
    // A constant-0.99 rng feeds every Beta/Gamma draw the same extreme
    // uniform, so both arms' samples land near the top of their own (very
    // different) posteriors - the well-proven high-reply-rate arm should win.
    const picked = await selectVariant(OWNER, { kind: "SUBJECT" }, () => 0.99);
    expect(picked.id).toBe("hi");
  });
});

/* ------------------------------- listVariantStats ------------------------------- */

describe("listVariantStats", () => {
  it("computes reply rate and marks the highest-rate variant per (segment, kind) group as winning", async () => {
    outreachVariantFindMany.mockResolvedValue([
      { id: "a", segmentId: "s1", kind: "SUBJECT", sends: 10, replies: 5, text: "A", active: true },
      { id: "b", segmentId: "s1", kind: "SUBJECT", sends: 10, replies: 2, text: "B", active: true },
      { id: "c", segmentId: "s2", kind: "SUBJECT", sends: 10, replies: 9, text: "C", active: true },
      { id: "d", segmentId: null, kind: "OPENER", sends: 0, replies: 0, text: "D", active: true },
    ]);
    const stats = await listVariantStats(OWNER);
    const byId = Object.fromEntries(stats.map((s) => [s.id, s]));

    expect(byId.a.replyRate).toBeCloseTo(0.5);
    expect(byId.b.replyRate).toBeCloseTo(0.2);
    expect(byId.a.winning).toBe(true);
    expect(byId.b.winning).toBe(false);

    // A different segment's group is independent: c wins its own group even
    // though it wasn't compared against a/b.
    expect(byId.c.winning).toBe(true);

    // A variant with zero sends can't be a winner yet.
    expect(byId.d.sends).toBe(0);
    expect(byId.d.replyRate).toBe(0);
    expect(byId.d.winning).toBe(false);
  });

  it("passes a segmentId filter through to the query when given", async () => {
    outreachVariantFindMany.mockResolvedValue([]);
    await listVariantStats(OWNER, { segmentId: "s1" });
    const where = outreachVariantFindMany.mock.calls[0][0].where;
    expect(where.segmentId).toBe("s1");
  });
});

/* -------------------------------- attributeReply -------------------------------- */

describe("attributeReply", () => {
  it("increments the variant returned by the atomic UPDATE, and only that variant", async () => {
    queryRaw.mockResolvedValue([{ variantId: "v1" }]);
    await attributeReply("c1");
    expect(outreachVariantUpdate).toHaveBeenCalledTimes(1);
    expect(outreachVariantUpdate).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { replies: { increment: 1 } },
    });
  });

  it("is a no-op (never calls update) when there is no unreplied send to attribute", async () => {
    queryRaw.mockResolvedValue([]);
    await attributeReply("c-with-no-sends");
    expect(outreachVariantUpdate).not.toHaveBeenCalled();
  });

  it("the raw query is parameterized on contactId (not string-concatenated)", async () => {
    queryRaw.mockResolvedValue([]);
    await attributeReply("c1' OR 1=1 --");
    // Prisma.sql tagged-template calls come through as a Sql object whose
    // .values carries the bound parameters, not inlined into .strings/.sql -
    // this is what protects against injection via a contactId that happens
    // to contain SQL-special characters.
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sqlArg.values).toContain("c1' OR 1=1 --");
    expect(sqlArg.sql).not.toContain("c1' OR 1=1 --");
  });
});
