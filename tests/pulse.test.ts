// The Pulse is the away-window brag on the dashboard. Hard rule: never show
// an empty brag. Manual/import rows and cheap search ledger lines must not
// count as "the agent did this while you were away".

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CREDIT_COSTS } from "@/lib/credits";

const entityCount = vi.fn();
const entityFindFirst = vi.fn();
const ledgerFindMany = vi.fn();
const monitorAggregate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      count: (...args: unknown[]) => entityCount(...args),
      findFirst: (...args: unknown[]) => entityFindFirst(...args),
    },
    creditLedger: {
      findMany: (...args: unknown[]) => ledgerFindMany(...args),
    },
    monitorRun: {
      aggregate: (...args: unknown[]) => monitorAggregate(...args),
    },
  },
}));

import { computePulse } from "@/lib/pulse";

const SINCE = new Date("2026-08-01T00:00:00.000Z");
const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  entityCount.mockResolvedValue(0);
  entityFindFirst.mockResolvedValue(null);
  ledgerFindMany.mockResolvedValue([]);
  monitorAggregate.mockResolvedValue({ _sum: { found: 0 } });
});

describe("computePulse", () => {
  it("returns null when the window is empty (no empty brag)", async () => {
    await expect(computePulse(USER, SINCE)).resolves.toBeNull();
  });

  it("returns a pulse when the agent added companies", async () => {
    entityCount.mockResolvedValue(2);
    entityFindFirst.mockResolvedValue({ name: "Acme", domain: "acme.com" });

    await expect(computePulse(USER, SINCE)).resolves.toEqual({
      companies: 2,
      enriched: 0,
      inMarket: 0,
      best: { name: "Acme", domain: "acme.com" },
    });
  });

  it("returns a pulse from enrichments or intent signals alone", async () => {
    ledgerFindMany.mockResolvedValueOnce([{ ref: "c1" }, { ref: "c2" }]);
    await expect(computePulse(USER, SINCE)).resolves.toMatchObject({
      companies: 0,
      enriched: 2,
      inMarket: 0,
    });

    ledgerFindMany.mockResolvedValueOnce([]);
    monitorAggregate.mockResolvedValueOnce({ _sum: { found: 4 } });
    await expect(computePulse(USER, SINCE)).resolves.toMatchObject({
      companies: 0,
      enriched: 0,
      inMarket: 4,
    });
  });

  it("scopes entity counts to non-manual agent sources in the window", async () => {
    await computePulse(USER, SINCE);
    expect(entityCount).toHaveBeenCalledWith({
      where: {
        userId: USER,
        createdAt: { gt: SINCE },
        OR: [{ source: null }, { source: { notIn: ["manual", "import"] } }],
      },
    });
    expect(entityFindFirst).toHaveBeenCalledWith({
      where: {
        userId: USER,
        createdAt: { gt: SINCE },
        OR: [{ source: null }, { source: { notIn: ["manual", "import"] } }],
      },
      orderBy: { createdAt: "desc" },
      select: { name: true, domain: true },
    });
  });

  it("counts distinct enrich refs and ignores cheap search actions", async () => {
    await computePulse(USER, SINCE);
    const ledgerWhere = ledgerFindMany.mock.calls[0][0].where as {
      action: { in: string[] };
      ref: { not: null };
    };
    expect(ledgerWhere.ref).toEqual({ not: null });
    expect(ledgerWhere.action.in).toEqual([
      "email",
      "phone",
      "linkedin",
      "contact_extract",
      "company_aspect",
      "deep_report",
      "analyze_site",
      "deep_research",
    ]);
    for (const cheap of ["web_search", "serp_search", "find_companies", "monitor_run", "build_segment"]) {
      expect(ledgerWhere.action.in, cheap).not.toContain(cheap);
    }
  });
});

describe("pulse enrich actions stay metered", () => {
  it("every Pulse enrich action is a real CREDIT_COSTS key", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/pulse.ts"), "utf8");
    const match = src.match(/const ENRICH_ACTIONS = \[([\s\S]*?)\];/);
    expect(match).toBeTruthy();
    const actions = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(CREDIT_COSTS, action).toHaveProperty(action);
    }
  });
});
