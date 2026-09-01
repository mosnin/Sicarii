// Radar extract must never dump publishers into the CRM and must stop
// ingesting when the creation budget is exhausted or OpenAI is missing.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generateObject = vi.fn();
const checkCreationBudget = vi.fn();
const entityFindFirst = vi.fn();
const entityCreate = vi.fn();
const contactFindFirst = vi.fn();
const contactCreate = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObject(...args),
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: () => "mock-model",
}));
vi.mock("@/lib/creation-guard", () => ({
  checkCreationBudget: (...args: unknown[]) => checkCreationBudget(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      findFirst: (...args: unknown[]) => entityFindFirst(...args),
      create: (...args: unknown[]) => entityCreate(...args),
    },
    contact: {
      findFirst: (...args: unknown[]) => contactFindFirst(...args),
      create: (...args: unknown[]) => contactCreate(...args),
    },
  },
}));

import { extractAndAddToCrm } from "@/lib/radar-extract";

beforeEach(() => {
  vi.clearAllMocks();
  checkCreationBudget.mockResolvedValue({ ok: true, recent: 0, limit: 1000, windowMinutes: 10 });
  entityFindFirst.mockResolvedValue(null);
  contactFindFirst.mockResolvedValue(null);
  entityCreate.mockImplementation(async ({ data }: { data: { name: string; domain?: string; website?: string } }) => ({
    id: `e-${data.name}`,
    name: data.name,
    domain: data.domain ?? null,
    website: data.website ?? null,
  }));
  contactCreate.mockResolvedValue({ id: "c1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("extractAndAddToCrm — safety gates", () => {
  it("returns empty and never calls the model when OpenAI is unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await extractAndAddToCrm("u1", [{ title: "Acme raised", url: "https://acme.com" }]);
    expect(result).toEqual({ entitiesAdded: 0, contactsAdded: 0, created: [] });
    expect(generateObject).not.toHaveBeenCalled();
    expect(checkCreationBudget).not.toHaveBeenCalled();
  });

  it("returns empty for an empty batch without calling the model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const result = await extractAndAddToCrm("u1", []);
    expect(result).toEqual({ entitiesAdded: 0, contactsAdded: 0, created: [] });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("stops ingesting when the creation budget is exhausted", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    checkCreationBudget.mockResolvedValue({ ok: false, recent: 1000, limit: 1000, windowMinutes: 10 });
    const result = await extractAndAddToCrm("u1", [{ title: "flood", url: "https://acme.com" }]);
    expect(result).toEqual({ entitiesAdded: 0, contactsAdded: 0, created: [] });
    expect(generateObject).not.toHaveBeenCalled();
    expect(entityCreate).not.toHaveBeenCalled();
  });
});

describe("extractAndAddToCrm — aggregator drop", () => {
  it("never creates a company whose domain is a publisher/aggregator", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    generateObject.mockResolvedValue({
      object: {
        entities: [
          { name: "TechCrunch", domain: "techcrunch.com", website: "https://techcrunch.com", industry: null, description: null },
          { name: "Acme", domain: "acme.com", website: "https://acme.com", industry: "SaaS", description: "Real co" },
        ],
        contacts: [],
      },
    });

    const result = await extractAndAddToCrm("u1", [{ title: "Acme news", url: "https://techcrunch.com/acme" }]);

    expect(entityCreate).toHaveBeenCalledTimes(1);
    expect(entityCreate.mock.calls[0][0].data.domain).toBe("acme.com");
    expect(result.entitiesAdded).toBe(1);
    expect(result.created.map((c) => c.domain)).toEqual(["acme.com"]);
  });

  it("skips placeholder names like unknown / n/a", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    generateObject.mockResolvedValue({
      object: {
        entities: [
          { name: "unknown", domain: "unknown.com", website: null, industry: null, description: null },
          { name: "n/a", domain: "na.com", website: null, industry: null, description: null },
        ],
        contacts: [{ name: "null", title: null, email: null, linkedin: null, company: null }],
      },
    });

    const result = await extractAndAddToCrm("u1", [{ title: "noise" }]);
    expect(result.entitiesAdded).toBe(0);
    expect(result.contactsAdded).toBe(0);
    expect(entityCreate).not.toHaveBeenCalled();
    expect(contactCreate).not.toHaveBeenCalled();
  });
});
