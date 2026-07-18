// DB-level dedupe backstop: @@unique([userId, domain]) on Entity and
// @@unique([userId, email]) on Contact (prisma/schema.prisma) close the race
// where two concurrent MCP tool calls both pass the app-level dedup check in
// createEntity/createContact/findCompanies/discoverLocalLeads before either
// commits. That means a create that used to always succeed can now fail with
// a P2002 unique-constraint violation when a concurrent request wins the
// race. These tests pin that a P2002 surfaces as a clean OpError (with a
// sensible message and a 409 status), never a raw, unhandled crash.

import { describe, it, expect, vi, beforeEach } from "vitest";

function p2002(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed on the fields: (`userId`,`domain`)"), {
    code: "P2002",
  });
}

const state = {
  entityCreateThrows: false,
  contactCreateThrows: false,
  entityCreateManyThrows: false,
};

const entityCreate = vi.fn(async (args: { data: Record<string, unknown> }) => {
  if (state.entityCreateThrows) throw p2002();
  return { id: "ent-1", ...args.data };
});
const entityCreateManyAndReturn = vi.fn(async (args: { data: Record<string, unknown>[] }) => {
  if (state.entityCreateManyThrows) throw p2002();
  return args.data.map((d, i) => ({ id: `ent-${i + 2}`, name: d.name, domain: d.domain }));
});
const contactCreate = vi.fn(async (args: { data: Record<string, unknown> }) => {
  if (state.contactCreateThrows) throw p2002();
  return { id: "con-1", ...args.data };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      create: (...a: unknown[]) => entityCreate(...(a as [never])),
      createManyAndReturn: (...a: unknown[]) => entityCreateManyAndReturn(...(a as [never])),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
    },
    contact: {
      create: (...a: unknown[]) => contactCreate(...(a as [never])),
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock("@/lib/explorium", () => ({
  enrichDomain: vi.fn(),
  isExploriumConfigured: () => true,
}));

vi.mock("@/lib/exa", () => ({
  exaFindCompanies: vi.fn(async () => [
    { companyName: "Acme", domain: "acme.com", website: null, phone: null, industry: null, address: null, description: null },
  ]),
  isExaConfigured: () => true,
}));

vi.mock("@/lib/apify", () => ({
  googleMapsLeads: vi.fn(async () => [
    { companyName: "Acme Local", domain: "acmelocal.com", website: null, phone: null, industry: null, address: null },
  ]),
  scrapeSiteContacts: vi.fn(async () => []),
  apifyGoogleSearch: vi.fn(async () => []),
  isApifyConfigured: () => true,
}));

vi.mock("@/lib/credits", () => ({
  ensureCredits: vi.fn(async () => {}),
  spendCredits: vi.fn(async () => {}),
}));

vi.mock("@/lib/provenance", () => ({
  recordProvenanceBulk: vi.fn(async () => {}),
  CONFIDENCE: { explorium: 90 },
}));

vi.mock("@/lib/agentphone", () => ({
  placeCall: vi.fn(),
  getCall: vi.fn(),
}));

import {
  createEntity,
  createContact,
  findCompanies,
  discoverLocalLeads,
  OpError,
} from "@/lib/crm-operations";

beforeEach(() => {
  state.entityCreateThrows = false;
  state.contactCreateThrows = false;
  state.entityCreateManyThrows = false;
  entityCreate.mockClear();
  entityCreateManyAndReturn.mockClear();
  contactCreate.mockClear();
});

describe("createEntity - P2002 handling", () => {
  it("creates normally when there is no collision", async () => {
    const entity = await createEntity("u1", { name: "Acme", domain: "acme.com" });
    expect(entity).toMatchObject({ name: "Acme", domain: "acme.com" });
  });

  it("turns a P2002 (concurrent duplicate domain) into a clean 409 OpError", async () => {
    state.entityCreateThrows = true;
    await expect(createEntity("u1", { name: "Acme", domain: "acme.com" })).rejects.toSatisfy(
      (e: unknown) => e instanceof OpError && e.status === 409 && /acme\.com/.test(e.message)
    );
  });

  it("does not swallow unrelated DB errors", async () => {
    entityCreate.mockImplementationOnce(async () => {
      throw new Error("connection refused");
    });
    await expect(createEntity("u1", { name: "Acme", domain: "acme.com" })).rejects.toThrow(
      "connection refused"
    );
  });
});

describe("createContact - P2002 handling", () => {
  it("creates normally when there is no collision", async () => {
    const contact = await createContact("u1", { name: "Jane", email: "jane@acme.com" });
    expect(contact).toMatchObject({ name: "Jane", email: "jane@acme.com" });
  });

  it("turns a P2002 (concurrent duplicate email) into a clean 409 OpError", async () => {
    state.contactCreateThrows = true;
    await expect(
      createContact("u1", { name: "Jane", email: "jane@acme.com" })
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof OpError && e.status === 409 && /jane@acme\.com/.test(e.message)
    );
  });

  it("does not swallow unrelated DB errors", async () => {
    contactCreate.mockImplementationOnce(async () => {
      throw new Error("connection refused");
    });
    await expect(
      createContact("u1", { name: "Jane", email: "jane@acme.com" })
    ).rejects.toThrow("connection refused");
  });
});

describe("findCompanies - P2002 handling on the batched insert", () => {
  it("turns a P2002 (a concurrent call inserted the same domain first) into a clean 409 OpError", async () => {
    state.entityCreateManyThrows = true;
    await expect(findCompanies("u1", { query: "fintech startups" })).rejects.toSatisfy(
      (e: unknown) => e instanceof OpError && e.status === 409
    );
  });
});

describe("discoverLocalLeads - P2002 handling on the batched insert", () => {
  it("turns a P2002 (a concurrent call inserted the same domain first) into a clean 409 OpError", async () => {
    state.entityCreateManyThrows = true;
    await expect(discoverLocalLeads("u1", { query: "coffee shops" })).rejects.toSatisfy(
      (e: unknown) => e instanceof OpError && e.status === 409
    );
  });
});
