// Verified-entity enrichment: ownership fence + fill-empty-only. A miss here
// either writes another user's legal record or overwrites a human-entered
// location/industry with registry data.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { entityFindUnique, entityUpdate } = vi.hoisted(() => ({
  entityFindUnique: vi.fn(),
  entityUpdate: vi.fn(),
}));
const { gleifLookup, companiesHouseLookup, isCompaniesHouseConfigured, secEdgarLookup } =
  vi.hoisted(() => ({
    gleifLookup: vi.fn(),
    companiesHouseLookup: vi.fn(),
    isCompaniesHouseConfigured: vi.fn(),
    secEdgarLookup: vi.fn(),
  }));
const { recordProvenanceBulk } = vi.hoisted(() => ({
  recordProvenanceBulk: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      findUnique: (...a: unknown[]) => entityFindUnique(...a),
      update: (...a: unknown[]) => entityUpdate(...a),
    },
  },
}));
vi.mock("@/lib/providers/gleif", () => ({ gleifLookup }));
vi.mock("@/lib/providers/companies-house", () => ({
  companiesHouseLookup,
  isCompaniesHouseConfigured,
  CH_ATTRIBUTION: "Contains public sector information licensed under the Open Government Licence v3.0.",
}));
vi.mock("@/lib/providers/sec-edgar", () => ({ secEdgarLookup }));
vi.mock("@/lib/provenance", () => ({
  recordProvenanceBulk,
  CONFIDENCE: { gleif: 95, companies_house: 90, sec_edgar: 90 },
}));

import { verifyEntity } from "@/lib/enrich/verified-entity";
import { OpError } from "@/lib/crm-operations";

const OWNER = "user-ada";
const ATTACKER = "user-eve";

function entity(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    userId: OWNER,
    name: "Acme",
    status: "NEW",
    location: null,
    industry: null,
    enrichment: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entityFindUnique.mockResolvedValue(entity());
  entityUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...entity(),
    ...data,
  }));
  isCompaniesHouseConfigured.mockReturnValue(true);
  gleifLookup.mockResolvedValue(null);
  companiesHouseLookup.mockResolvedValue(null);
  secEdgarLookup.mockResolvedValue(null);
  recordProvenanceBulk.mockResolvedValue(undefined);
});

describe("verifyEntity - isolation", () => {
  it("404s for a non-owner and never updates or writes provenance", async () => {
    await expect(verifyEntity(ATTACKER, "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(gleifLookup).not.toHaveBeenCalled();
    expect(entityUpdate).not.toHaveBeenCalled();
    expect(recordProvenanceBulk).not.toHaveBeenCalled();
  });

  it("404s when the entity is missing", async () => {
    entityFindUnique.mockResolvedValue(null);
    await expect(verifyEntity(OWNER, "missing")).rejects.toBeInstanceOf(OpError);
    expect(entityUpdate).not.toHaveBeenCalled();
  });
});

describe("verifyEntity - fill-empty-only", () => {
  const gleif = {
    lei: "lei-1",
    legalName: "Acme, Inc.",
    address: "1 Market St, SF",
    source: "gleif" as const,
  };
  const ch = {
    companyNumber: "01234567",
    companyName: "ACME LTD",
    address: "10 Downing St, London",
    source: "companies_house" as const,
  };
  const edgar = {
    cik: "0000123456",
    name: "ACME INC",
    sicDescription: "Software",
    address: "1 Infinite Loop",
    source: "sec_edgar" as const,
  };

  it("fills blank location and industry, preferring Companies House then GLEIF then EDGAR", async () => {
    gleifLookup.mockResolvedValue(gleif);
    companiesHouseLookup.mockResolvedValue(ch);
    secEdgarLookup.mockResolvedValue(edgar);

    await verifyEntity(OWNER, "e1");

    expect(entityUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: expect.objectContaining({
        status: "ENRICHED",
        location: "10 Downing St, London",
        industry: "Software",
      }),
    });
    const rows = recordProvenanceBulk.mock.calls[0]?.[0] as Array<{ field: string; source: string }>;
    expect(rows.map((r) => r.field)).toEqual(
      expect.arrayContaining(["lei", "company_number", "sec_cik", "location", "industry"]),
    );
    expect(rows.find((r) => r.field === "location")?.source).toBe("companies_house");
    expect(rows.find((r) => r.field === "industry")?.source).toBe("sec_edgar");
  });

  it("does not overwrite an existing location or industry", async () => {
    entityFindUnique.mockResolvedValue(
      entity({ location: "Human-entered HQ", industry: "Human industry" }),
    );
    gleifLookup.mockResolvedValue(gleif);
    companiesHouseLookup.mockResolvedValue(ch);
    secEdgarLookup.mockResolvedValue(edgar);

    await verifyEntity(OWNER, "e1");

    const data = entityUpdate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.location).toBeUndefined();
    expect(data.industry).toBeUndefined();
    const rows = recordProvenanceBulk.mock.calls[0]?.[0] as Array<{ field: string }>;
    expect(rows.map((r) => r.field)).not.toEqual(expect.arrayContaining(["location", "industry"]));
  });

  it("merges legal into existing enrichment instead of replacing it", async () => {
    entityFindUnique.mockResolvedValue(entity({ enrichment: { tech: [{ name: "Next.js" }] } }));
    gleifLookup.mockResolvedValue(gleif);

    await verifyEntity(OWNER, "e1");

    const data = entityUpdate.mock.calls[0]?.[0]?.data as { enrichment: Record<string, unknown> };
    expect(data.enrichment.tech).toEqual([{ name: "Next.js" }]);
    expect(data.enrichment.legal).toMatchObject({
      gleif,
      attribution: expect.arrayContaining([expect.stringContaining("GLEIF")]),
    });
  });

  it("404s and writes nothing when every registry misses", async () => {
    await expect(verifyEntity(OWNER, "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(entityUpdate).not.toHaveBeenCalled();
    expect(recordProvenanceBulk).not.toHaveBeenCalled();
  });

  it("skips Companies House entirely when it is not configured", async () => {
    isCompaniesHouseConfigured.mockReturnValue(false);
    gleifLookup.mockResolvedValue(gleif);

    await verifyEntity(OWNER, "e1");

    expect(companiesHouseLookup).not.toHaveBeenCalled();
    expect(entityUpdate).toHaveBeenCalled();
  });
});
