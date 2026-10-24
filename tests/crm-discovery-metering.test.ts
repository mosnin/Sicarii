// Paid discovery / enrichment must never charge a miss and must fail closed
// when the provider is not configured — before any credit gate or outbound
// call. These are the CRM ops wrappers (enrichEntity, findCompanies,
// discoverLocalLeads, extractSiteContacts, searchGoogle); swarmDiscover's
// metering is already pinned in tests/swarm-discovery.test.ts.

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
  CREDIT_COSTS: {
    find_companies: 12,
    maps_leads: 15,
    contact_extract: 8,
    serp_search: 4,
    company_aspect: 30,
  },
}));

const { isExploriumConfigured, enrichDomain } = vi.hoisted(() => ({
  isExploriumConfigured: vi.fn(() => true),
  enrichDomain: vi.fn(),
}));
vi.mock("@/lib/explorium", () => ({ isExploriumConfigured, enrichDomain }));

const { isExaConfigured, exaFindCompanies } = vi.hoisted(() => ({
  isExaConfigured: vi.fn(() => true),
  exaFindCompanies: vi.fn(),
}));
vi.mock("@/lib/exa", () => ({ isExaConfigured, exaFindCompanies }));

const { isApifyConfigured, googleMapsLeads, scrapeSiteContacts, apifyGoogleSearch } = vi.hoisted(() => ({
  isApifyConfigured: vi.fn(() => true),
  googleMapsLeads: vi.fn(),
  scrapeSiteContacts: vi.fn(),
  apifyGoogleSearch: vi.fn(),
}));
vi.mock("@/lib/apify", () => ({
  isApifyConfigured,
  googleMapsLeads,
  scrapeSiteContacts,
  apifyGoogleSearch,
}));

vi.mock("@/lib/provenance", () => ({
  recordProvenanceBulk: vi.fn().mockResolvedValue(undefined),
  CONFIDENCE: { explorium: 0.8 },
}));

const entityFindUnique = vi.fn();
const entityUpdate = vi.fn();
const entityFindMany = vi.fn();
const entityCreateManyAndReturn = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      findUnique: (...a: unknown[]) => entityFindUnique(...a),
      update: (...a: unknown[]) => entityUpdate(...a),
      findMany: (...a: unknown[]) => entityFindMany(...a),
      createManyAndReturn: (...a: unknown[]) => entityCreateManyAndReturn(...a),
    },
  },
}));

import {
  enrichEntity,
  findCompanies,
  discoverLocalLeads,
  extractSiteContacts,
  searchGoogle,
} from "@/lib/crm-operations";

const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  isExploriumConfigured.mockReturnValue(true);
  isExaConfigured.mockReturnValue(true);
  isApifyConfigured.mockReturnValue(true);
  entityFindMany.mockResolvedValue([]);
  entityCreateManyAndReturn.mockResolvedValue([]);
});

describe("enrichEntity", () => {
  it("throws 400 when the entity has no domain, and never calls Explorium or credits", async () => {
    entityFindUnique.mockResolvedValue({ id: "e1", userId: USER, domain: null, enrichment: null });
    await expect(enrichEntity(USER, "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(enrichDomain).not.toHaveBeenCalled();
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("throws 501 when Explorium is not configured, before any credit gate", async () => {
    isExploriumConfigured.mockReturnValue(false);
    entityFindUnique.mockResolvedValue({ id: "e1", userId: USER, domain: "acme.com", enrichment: null });
    await expect(enrichEntity(USER, "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(enrichDomain).not.toHaveBeenCalled();
  });

  it("is idempotent: already-enriched firmographics skip credits and the provider", async () => {
    const existing = {
      id: "e1",
      userId: USER,
      domain: "acme.com",
      enrichment: { firmographics: { name: "Acme" } },
    };
    entityFindUnique.mockResolvedValue(existing);
    await expect(enrichEntity(USER, "e1")).resolves.toBe(existing);
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(enrichDomain).not.toHaveBeenCalled();
    expect(entityUpdate).not.toHaveBeenCalled();
  });

  it("gates before the paid call and debits company_aspect only after persist", async () => {
    entityFindUnique.mockResolvedValue({
      id: "e1",
      userId: USER,
      domain: "acme.com",
      enrichment: null,
      industry: null,
      location: null,
      phone: null,
      description: null,
      website: null,
    });
    enrichDomain.mockImplementation(async () => {
      callOrder.push("enrichDomain");
      return { raw: { name: "Acme" }, fields: { industry: "SaaS" } };
    });
    entityUpdate.mockImplementation(async (args: unknown) => {
      callOrder.push("entity.update");
      return args;
    });

    await enrichEntity(USER, "e1");

    expect(ensureCredits).toHaveBeenCalledWith(USER, "company_aspect");
    expect(spendCredits).toHaveBeenCalledWith(USER, "company_aspect", { ref: "e1" });
    expect(callOrder).toEqual(["ensureCredits", "enrichDomain", "entity.update", "spendCredits"]);
  });
});

describe("findCompanies / discoverLocalLeads metering", () => {
  it("findCompanies throws 501 when Exa is not configured, before credits", async () => {
    isExaConfigured.mockReturnValue(false);
    await expect(findCompanies(USER, { query: "saas" })).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(exaFindCompanies).not.toHaveBeenCalled();
  });

  it("findCompanies never spends on an empty provider result", async () => {
    exaFindCompanies.mockResolvedValue([]);
    const result = await findCompanies(USER, { query: "saas" });
    expect(ensureCredits).toHaveBeenCalledWith(USER, "find_companies");
    expect(spendCredits).not.toHaveBeenCalled();
    expect(result.added).toBe(0);
  });

  it("discoverLocalLeads throws 501 when Apify is not configured", async () => {
    isApifyConfigured.mockReturnValue(false);
    await expect(discoverLocalLeads(USER, { query: "plumbers" })).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(googleMapsLeads).not.toHaveBeenCalled();
  });

  it("discoverLocalLeads never spends on an empty provider result", async () => {
    googleMapsLeads.mockResolvedValue([]);
    await discoverLocalLeads(USER, { query: "plumbers" });
    expect(ensureCredits).toHaveBeenCalledWith(USER, "maps_leads");
    expect(spendCredits).not.toHaveBeenCalled();
  });
});

describe("extractSiteContacts / searchGoogle metering", () => {
  it("extractSiteContacts throws 501 when Apify is not configured", async () => {
    isApifyConfigured.mockReturnValue(false);
    await expect(extractSiteContacts(USER, "https://acme.com")).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(scrapeSiteContacts).not.toHaveBeenCalled();
  });

  it("extractSiteContacts never spends on a miss", async () => {
    scrapeSiteContacts.mockResolvedValue([]);
    const result = await extractSiteContacts(USER, "https://acme.com");
    expect(ensureCredits).toHaveBeenCalledWith(USER, "contact_extract");
    expect(spendCredits).not.toHaveBeenCalled();
    expect(result.found).toBe(0);
  });

  it("searchGoogle throws 501 when Apify is not configured", async () => {
    isApifyConfigured.mockReturnValue(false);
    await expect(searchGoogle(USER, { query: "acme" })).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(apifyGoogleSearch).not.toHaveBeenCalled();
  });

  it("searchGoogle never spends on a miss", async () => {
    apifyGoogleSearch.mockResolvedValue([]);
    await searchGoogle(USER, { query: "acme" });
    expect(ensureCredits).toHaveBeenCalledWith(USER, "serp_search");
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("searchGoogle spends serp_search only when results come back", async () => {
    apifyGoogleSearch.mockResolvedValue([{ title: "Acme", url: "https://acme.com" }]);
    const result = await searchGoogle(USER, { query: "acme" });
    expect(spendCredits).toHaveBeenCalledWith(USER, "serp_search");
    expect(result.count).toBe(1);
  });
});
