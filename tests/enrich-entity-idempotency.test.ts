// MCP/ops enrichEntity is the shared firmographics path (agent + MCP).
// An agent re-calling enrich_entity on the same id must not re-hit Explorium
// or re-charge company_aspect. A miss must never debit. Filled columns stay
// put. Isolation is covered in tests/ops-isolation.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureCredits, spendCredits, callOrder } = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    ensureCredits: vi.fn(async () => {
      callOrder.push("ensureCredits");
    }),
    spendCredits: vi.fn(async () => {
      callOrder.push("spendCredits");
    }),
  };
});
vi.mock("@/lib/credits", () => ({
  ensureCredits,
  spendCredits,
  ensureCreditsForCount: vi.fn(),
  CREDIT_COSTS: { company_aspect: 30 },
}));

const { enrichDomain, isExploriumConfigured } = vi.hoisted(() => ({
  enrichDomain: vi.fn(),
  isExploriumConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/explorium", () => ({ enrichDomain, isExploriumConfigured }));

const entityFindUnique = vi.fn();
const entityUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  id: "e1",
  userId: "user-1",
  ...data,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      findUnique: (...args: unknown[]) => entityFindUnique(...args),
      update: (args: { data: Record<string, unknown> }) => entityUpdate(args),
    },
  },
}));

const recordProvenanceBulk = vi.fn(async () => undefined);
vi.mock("@/lib/provenance", () => ({
  recordProvenanceBulk: (...args: unknown[]) => recordProvenanceBulk(...args),
  CONFIDENCE: { explorium: 0.8 },
}));

import { enrichEntity, OpError } from "@/lib/crm-operations";

const USER = "user-1";

function owned(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    userId: USER,
    domain: "acme.com",
    industry: null,
    location: null,
    phone: null,
    description: null,
    website: null,
    enrichment: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  isExploriumConfigured.mockReturnValue(true);
  entityFindUnique.mockResolvedValue(owned());
  entityUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "e1",
    userId: USER,
    ...data,
  }));
});

describe("enrichEntity idempotency and metering", () => {
  it("returns the existing row and never charges when firmographics are already present", async () => {
    const entity = owned({
      enrichment: { firmographics: { employees: 12 } },
      industry: "Dental",
    });
    entityFindUnique.mockResolvedValue(entity);

    await expect(enrichEntity(USER, "e1")).resolves.toBe(entity);

    expect(ensureCredits).not.toHaveBeenCalled();
    expect(enrichDomain).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(entityUpdate).not.toHaveBeenCalled();
    expect(recordProvenanceBulk).not.toHaveBeenCalled();
  });

  it("gates before Explorium, then debits company_aspect only after the row is persisted", async () => {
    enrichDomain.mockImplementation(async () => {
      callOrder.push("enrichDomain");
      return {
        businessId: "b1",
        raw: { employees: 40 },
        fields: { industry: "Software", address: "Austin, TX" },
      };
    });
    entityUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      callOrder.push("entity.update");
      return { id: "e1", userId: USER, ...args.data };
    });

    await enrichEntity(USER, "e1");

    expect(ensureCredits).toHaveBeenCalledWith(USER, "company_aspect");
    expect(spendCredits).toHaveBeenCalledWith(USER, "company_aspect", { ref: "e1" });
    expect(callOrder).toEqual([
      "ensureCredits",
      "enrichDomain",
      "entity.update",
      "spendCredits",
    ]);
  });

  it("never charges and never writes when Explorium has no match", async () => {
    enrichDomain.mockResolvedValue(null);

    await expect(enrichEntity(USER, "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });

    expect(ensureCredits).toHaveBeenCalledOnce();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(entityUpdate).not.toHaveBeenCalled();
  });

  it("fills empty columns but never overwrites ones the user already set", async () => {
    entityFindUnique.mockResolvedValue(
      owned({ industry: "Keep Me", description: null }),
    );
    enrichDomain.mockResolvedValue({
      businessId: "b1",
      raw: { employees: 9 },
      fields: {
        industry: "Overwrite?",
        address: "London",
        description: "Makes widgets",
      },
    });

    await enrichEntity(USER, "e1");

    const data = entityUpdate.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.industry).toBeUndefined();
    expect(data.location).toBe("London");
    expect(data.description).toBe("Makes widgets");
    expect(data.status).toBe("ENRICHED");
    expect(data.enrichment).toEqual({ firmographics: { employees: 9 } });
  });

  it("refuses an entity with no domain before any paid work", async () => {
    entityFindUnique.mockResolvedValue(owned({ domain: null }));

    await expect(enrichEntity(USER, "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(enrichDomain).not.toHaveBeenCalled();
  });

  it("refuses when Explorium is not configured", async () => {
    isExploriumConfigured.mockReturnValue(false);

    await expect(enrichEntity(USER, "e1")).rejects.toBeInstanceOf(OpError);
    await expect(enrichEntity(USER, "e1")).rejects.toMatchObject({ status: 501 });
    expect(ensureCredits).not.toHaveBeenCalled();
  });
});
