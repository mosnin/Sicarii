// The Pulse is what the agent did while you were away. Hard rule (the
// falsifier): never show an empty brag. computePulse returns null when the
// window is empty so the dashboard falls back to a normal greeting instead
// of "added 0 companies". Voice already mocks this; these tests pin the
// query itself — user scoping, the not-manual filter, enrich actions, and
// the all-zeros → null contract.

import { describe, it, expect, vi, beforeEach } from "vitest";

const entityCount = vi.fn();
const entityFindFirst = vi.fn();
const creditLedgerFindMany = vi.fn();
const monitorRunAggregate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      count: (...a: unknown[]) => entityCount(...a),
      findFirst: (...a: unknown[]) => entityFindFirst(...a),
    },
    creditLedger: {
      findMany: (...a: unknown[]) => creditLedgerFindMany(...a),
    },
    monitorRun: {
      aggregate: (...a: unknown[]) => monitorRunAggregate(...a),
    },
  },
}));

import { computePulse } from "@/lib/pulse";

const USER = "user-1";
const SINCE = new Date("2026-09-01T00:00:00Z");

function emptyWindow() {
  entityCount.mockResolvedValue(0);
  creditLedgerFindMany.mockResolvedValue([]);
  monitorRunAggregate.mockResolvedValue({ _sum: { found: 0 } });
  entityFindFirst.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  emptyWindow();
});

describe("computePulse empty-brag rule", () => {
  it("returns null when nothing happened in the window", async () => {
    await expect(computePulse(USER, SINCE)).resolves.toBeNull();
  });

  it("returns null when inMarket is a null aggregate (no monitor rows)", async () => {
    monitorRunAggregate.mockResolvedValue({ _sum: { found: null } });
    await expect(computePulse(USER, SINCE)).resolves.toBeNull();
  });

  it("returns a pulse when only companies are non-zero", async () => {
    entityCount.mockResolvedValue(2);
    entityFindFirst.mockResolvedValue({ name: "Acme", domain: "acme.com" });
    await expect(computePulse(USER, SINCE)).resolves.toEqual({
      companies: 2,
      enriched: 0,
      inMarket: 0,
      best: { name: "Acme", domain: "acme.com" },
    });
  });

  it("returns a pulse when only enrichments are non-zero (no empty brag)", async () => {
    creditLedgerFindMany.mockResolvedValue([{ ref: "c1" }, { ref: "c2" }]);
    await expect(computePulse(USER, SINCE)).resolves.toEqual({
      companies: 0,
      enriched: 2,
      inMarket: 0,
      best: null,
    });
  });

  it("returns a pulse when only in-market signals are non-zero", async () => {
    monitorRunAggregate.mockResolvedValue({ _sum: { found: 4 } });
    await expect(computePulse(USER, SINCE)).resolves.toEqual({
      companies: 0,
      enriched: 0,
      inMarket: 4,
      best: null,
    });
  });
});

describe("computePulse query fences", () => {
  it("scopes every query to the caller and the since window", async () => {
    await computePulse(USER, SINCE);

    expect(entityCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER,
          createdAt: { gt: SINCE },
        }),
      }),
    );
    expect(creditLedgerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER,
          createdAt: { gt: SINCE },
        }),
      }),
    );
    expect(monitorRunAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER, createdAt: { gt: SINCE } },
      }),
    );
  });

  it("excludes hand-added companies (manual / import) from the brag", async () => {
    await computePulse(USER, SINCE);
    const where = entityCount.mock.calls[0][0].where as {
      OR?: unknown;
      source?: unknown;
    };
    // NOT_MANUAL is spread onto the where: source is null OR notIn manual/import.
    expect(where.OR).toEqual([{ source: null }, { source: { notIn: ["manual", "import"] } }]);
  });

  it("counts only real enrichment ledger actions, not cheap searches", async () => {
    await computePulse(USER, SINCE);
    const action = (creditLedgerFindMany.mock.calls[0][0].where as { action: { in: string[] } }).action;
    expect(action.in).toEqual(
      expect.arrayContaining(["email", "phone", "linkedin", "contact_extract", "deep_research"]),
    );
    expect(action.in).not.toContain("web_search");
    expect(action.in).not.toContain("find_companies");
    expect(action.in).not.toContain("remember");
  });
});
