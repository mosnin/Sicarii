// Radar "Add to CRM" extract path. An LLM batch can name publishers, send
// sentinel strings, or repeat the same company. These tests pin the fences
// that keep article pages and duplicates out of the CRM.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  checkCreationBudget,
  generateObject,
  entityFindFirst,
  entityCreate,
  contactFindFirst,
  contactCreate,
} = vi.hoisted(() => ({
  checkCreationBudget: vi.fn(),
  generateObject: vi.fn(),
  entityFindFirst: vi.fn(),
  entityCreate: vi.fn(),
  contactFindFirst: vi.fn(),
  contactCreate: vi.fn(),
}));

vi.mock("@/lib/creation-guard", () => ({ checkCreationBudget }));
vi.mock("ai", () => ({ generateObject }));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-model"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: { findFirst: entityFindFirst, create: entityCreate },
    contact: { findFirst: contactFindFirst, create: contactCreate },
  },
}));

import { extractAndAddToCrm } from "@/lib/radar-extract";

const ITEMS = [{ title: "Who is buying AI CRMs", url: "https://techcrunch.com/ai-crm", summary: "Acme mentioned" }];

function llm(partial: { entities?: unknown[]; contacts?: unknown[] }) {
  generateObject.mockResolvedValue({
    object: {
      entities: partial.entities ?? [],
      contacts: partial.contacts ?? [],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  checkCreationBudget.mockResolvedValue({ ok: true, recent: 0, limit: 1000, windowMinutes: 10 });
  entityFindFirst.mockResolvedValue(null);
  contactFindFirst.mockResolvedValue(null);
  entityCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `ent-${String(data.name).toLowerCase().replace(/\s+/g, "-")}`,
    name: data.name,
    domain: data.domain ?? null,
    website: data.website ?? null,
  }));
  contactCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `c-${String(data.name).toLowerCase().replace(/\s+/g, "-")}`,
    ...data,
  }));
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("extractAndAddToCrm guards", () => {
  it("does nothing without an OpenAI key", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(extractAndAddToCrm("u1", ITEMS)).resolves.toEqual({
      entitiesAdded: 0,
      contactsAdded: 0,
      created: [],
    });
    expect(generateObject).not.toHaveBeenCalled();
    expect(entityCreate).not.toHaveBeenCalled();
  });

  it("does nothing on an empty batch", async () => {
    await expect(extractAndAddToCrm("u1", [])).resolves.toEqual({
      entitiesAdded: 0,
      contactsAdded: 0,
      created: [],
    });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("stops during a creation cooldown and never calls the model", async () => {
    checkCreationBudget.mockResolvedValue({ ok: false, recent: 1000, limit: 1000, windowMinutes: 10 });
    await expect(extractAndAddToCrm("u1", ITEMS)).resolves.toEqual({
      entitiesAdded: 0,
      contactsAdded: 0,
      created: [],
    });
    expect(generateObject).not.toHaveBeenCalled();
    expect(entityCreate).not.toHaveBeenCalled();
  });
});

describe("extractAndAddToCrm entity fences", () => {
  it("drops publisher/aggregator domains even when the model names a real company", async () => {
    llm({
      entities: [
        { name: "TechCrunch", domain: "www.techcrunch.com", website: null, industry: "Media", description: null },
        { name: "G2 reviews", domain: null, website: "https://www.g2.com/products/acme", industry: null, description: null },
        { name: "Acme", domain: "acme.com", website: "https://www.acme.com", industry: "SaaS", description: "CRM" },
      ],
    });

    const result = await extractAndAddToCrm("u1", ITEMS);
    expect(result.entitiesAdded).toBe(1);
    expect(result.created).toEqual([
      { id: "ent-acme", kind: "entity", name: "Acme", domain: "acme.com", url: "https://www.acme.com" },
    ]);
    expect(entityCreate).toHaveBeenCalledTimes(1);
    expect(entityCreate.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      name: "Acme",
      domain: "acme.com",
      source: "radar",
      tags: ["intent"],
    });
  });

  it("skips sentinel names and in-batch domain/name duplicates", async () => {
    llm({
      entities: [
        { name: "unknown", domain: "mystery.com", website: null, industry: null, description: null },
        { name: "n/a", domain: "nada.com", website: null, industry: null, description: null },
        { name: "Acme", domain: "acme.com", website: null, industry: null, description: null },
        { name: "Acme Inc", domain: "acme.com", website: "https://acme.com/about", industry: null, description: null },
        { name: "Acme", domain: "acme.io", website: null, industry: null, description: null },
      ],
    });

    const result = await extractAndAddToCrm("u1", ITEMS);
    expect(result.entitiesAdded).toBe(1);
    expect(entityCreate).toHaveBeenCalledTimes(1);
    expect(entityCreate.mock.calls[0][0].data.domain).toBe("acme.com");
  });

  it("does not recreate an entity already in the CRM (domain, then name)", async () => {
    entityFindFirst
      .mockResolvedValueOnce({ id: "existing-domain" })
      .mockResolvedValueOnce({ id: "existing-name" });
    llm({
      entities: [
        { name: "Acme", domain: "acme.com", website: null, industry: null, description: null },
        { name: "Beta Labs", domain: null, website: null, industry: null, description: null },
      ],
    });

    const result = await extractAndAddToCrm("u1", ITEMS);
    expect(result.entitiesAdded).toBe(0);
    expect(entityCreate).not.toHaveBeenCalled();
    expect(entityFindFirst).toHaveBeenNthCalledWith(1, {
      where: { userId: "u1", domain: "acme.com" },
      select: { id: true },
    });
    expect(entityFindFirst).toHaveBeenNthCalledWith(2, {
      where: { userId: "u1", name: { equals: "Beta Labs", mode: "insensitive" } },
      select: { id: true },
    });
  });
});

describe("extractAndAddToCrm contact fences", () => {
  it("skips people already in the CRM by email or name+company", async () => {
    llm({
      contacts: [
        { name: "Jordan Lee", title: "VP", email: "jordan@acme.com", linkedin: null, company: "Acme" },
        { name: "Sam Reed", title: null, email: null, linkedin: null, company: "Acme" },
      ],
    });
    contactFindFirst
      .mockResolvedValueOnce({ id: "c-email" })
      .mockResolvedValueOnce({ id: "c-name" });

    const result = await extractAndAddToCrm("u1", ITEMS);
    expect(result.contactsAdded).toBe(0);
    expect(contactCreate).not.toHaveBeenCalled();
    expect(contactFindFirst.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        { email: { equals: "jordan@acme.com", mode: "insensitive" } },
      ]),
    );
  });

  it("dedupes the same person in-batch and links a new contact to the created entity", async () => {
    llm({
      entities: [{ name: "Acme", domain: "acme.com", website: null, industry: null, description: null }],
      contacts: [
        { name: "Jordan Lee", title: "VP Sales", email: "jordan@acme.com", linkedin: null, company: "Acme" },
        { name: "Jordan  Lee", title: "VP", email: "other@acme.com", linkedin: null, company: "Acme" },
        { name: "null", title: null, email: null, linkedin: null, company: "Acme" },
      ],
    });

    const result = await extractAndAddToCrm("u1", ITEMS);
    expect(result.entitiesAdded).toBe(1);
    expect(result.contactsAdded).toBe(1);
    expect(contactCreate).toHaveBeenCalledTimes(1);
    expect(contactCreate.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      name: "Jordan Lee",
      email: "jordan@acme.com",
      company: "Acme",
      entityId: "ent-acme",
      source: "radar",
      tags: ["intent"],
    });
  });
});
