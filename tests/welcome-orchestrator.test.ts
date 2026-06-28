// Tests for the welcome orchestrator:
// 1. Event sequencing when providers are configured (mocked)
// 2. Degradation fallback when no providers are configured
// 3. ICP is saved as productContext
//
// Note on mock setup: vi.mock factories are hoisted to the top of the file by
// vitest, so they cannot reference variables declared below them. We use
// vi.fn() inside the factory and then assign/configure via the imported mock
// module's exported fns, or we pull the mocks from the factory via a shared
// object that IS in scope at hoist time.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --------------------------------------------------------------------------
// Mocks - all factories use only literals or inline vi.fn() (no outer vars)
// --------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => {
  const user = {
    update: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue({ productContext: null }),
  };
  const entity = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  };
  return { prisma: { user, entity } };
});

vi.mock("@/lib/exa", () => ({
  exaFindCompanies: vi.fn(),
  isExaConfigured: vi.fn(),
}));

vi.mock("@/lib/explorium", () => ({
  enrichDomain: vi.fn(),
  isExploriumConfigured: vi.fn(),
}));

vi.mock("@/lib/pipe0", () => ({
  getCompanyNews: vi.fn(),
  isPipe0Configured: vi.fn(),
}));

vi.mock("@/lib/crm-operations", () => {
  let counter = 0;
  return {
    createEntity: vi.fn().mockImplementation(
      (_userId: string, input: { name: string; domain?: string | null; industry?: string | null; location?: string | null; description?: string | null }) => {
        counter++;
        return Promise.resolve({
          id: `entity-${counter}`,
          name: input.name,
          domain: input.domain ?? null,
          industry: input.industry ?? null,
          location: input.location ?? null,
          description: input.description ?? null,
        });
      },
    ),
    updateEntity: vi.fn().mockResolvedValue({}),
    OpError: class OpError extends Error {
      status: number;
      constructor(message: string, status = 400) {
        super(message);
        this.status = status;
      }
    },
  };
});

// --------------------------------------------------------------------------
// Import the module under test and the mocks we need to configure
// --------------------------------------------------------------------------

import { runWelcomeOrchestration } from "@/lib/welcome-orchestrator";
import type { WelcomeEvent } from "@/lib/welcome-orchestrator";
import { prisma } from "@/lib/prisma";
import { exaFindCompanies, isExaConfigured } from "@/lib/exa";
import { enrichDomain, isExploriumConfigured } from "@/lib/explorium";
import { getCompanyNews, isPipe0Configured } from "@/lib/pipe0";
import { createEntity } from "@/lib/crm-operations";

// Typed references to the vi.fn() mocks.
const mockExaFindCompanies = vi.mocked(exaFindCompanies);
const mockIsExaConfigured = vi.mocked(isExaConfigured);
const mockEnrichDomain = vi.mocked(enrichDomain);
const mockIsExploriumConfigured = vi.mocked(isExploriumConfigured);
const mockGetCompanyNews = vi.mocked(getCompanyNews);
const mockIsPipe0Configured = vi.mocked(isPipe0Configured);
const mockCreateEntity = vi.mocked(createEntity);
const mockPrismaUser = prisma.user as unknown as { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
const mockPrismaEntity = prisma.entity as unknown as { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

// --------------------------------------------------------------------------
// Two fake companies used across tests
// --------------------------------------------------------------------------

const FAKE_COMPANIES = [
  {
    companyName: "Acme Corp",
    domain: "acme.com",
    website: "https://acme.com",
    industry: "Software",
    address: "San Francisco, CA",
    description: "A test company",
    sourceUrl: "https://acme.com",
  },
  {
    companyName: "Bravo Inc",
    domain: "bravo.io",
    website: "https://bravo.io",
    industry: "Marketing",
    address: "Austin, TX",
    description: "Another test company",
    sourceUrl: "https://bravo.io",
  },
];

// --------------------------------------------------------------------------
// Tests: providers configured
// --------------------------------------------------------------------------

describe("runWelcomeOrchestration - providers configured", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsExaConfigured.mockReturnValue(true);
    mockIsExploriumConfigured.mockReturnValue(true);
    mockIsPipe0Configured.mockReturnValue(true);

    mockExaFindCompanies.mockResolvedValue(FAKE_COMPANIES);
    mockEnrichDomain.mockResolvedValue({
      businessId: "biz-1",
      raw: { name: "Acme Corp" },
      fields: {
        companyName: "Acme Corp",
        domain: "acme.com",
        website: "https://acme.com",
        industry: "SaaS",
        address: "SF, CA",
        phone: undefined,
        description: "Cloud software",
      },
    });
    mockGetCompanyNews.mockResolvedValue({
      records: [{ headline: "Acme announces new product" }],
    });

    mockPrismaEntity.findMany.mockResolvedValue([]);
    mockPrismaEntity.count.mockResolvedValue(0);
    mockPrismaEntity.findUnique.mockImplementation(
      (args: { where: { id: string } }) =>
        Promise.resolve({
          id: args.where.id,
          userId: "user-1",
          enrichment: null,
          industry: null,
          location: null,
          phone: null,
          description: null,
          website: null,
        }),
    );
    mockPrismaUser.findUnique.mockResolvedValue({ productContext: null });
  });

  it("saves the ICP as productContext", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "B2B SaaS companies in SF", (e) => events.push(e));

    expect(mockPrismaUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ productContext: "B2B SaaS companies in SF" }),
      }),
    );
  });

  it("emits at least one status event, company events, and a done event", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "B2B SaaS companies", (e) => events.push(e));

    const types = events.map((e) => e.type);
    expect(types).toContain("status");
    expect(types).toContain("company");
    expect(types).toContain("done");
  });

  it("emits company events before enriched events (discover then enrich order)", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "B2B SaaS", (e) => events.push(e));

    const firstCompanyIdx = events.findIndex((e) => e.type === "company");
    const firstEnrichedIdx = events.findIndex((e) => e.type === "enriched");

    if (firstEnrichedIdx !== -1) {
      expect(firstCompanyIdx).toBeLessThan(firstEnrichedIdx);
    }
  });

  it("emits a done event with total > 0", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "B2B SaaS", (e) => events.push(e));

    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done?.total).toBeGreaterThan(0);
  });

  it("calls createEntity for each discovered company", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "software companies", (e) => events.push(e));

    expect(mockCreateEntity).toHaveBeenCalled();
    for (const call of mockCreateEntity.mock.calls) {
      expect(call[0]).toBe("user-1");
    }
  });
});

// --------------------------------------------------------------------------
// Tests: no providers configured (degradation)
// --------------------------------------------------------------------------

describe("runWelcomeOrchestration - no providers (degradation fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsExaConfigured.mockReturnValue(false);
    mockIsExploriumConfigured.mockReturnValue(false);
    mockIsPipe0Configured.mockReturnValue(false);

    mockPrismaEntity.findMany.mockResolvedValue([]);
    mockPrismaEntity.count.mockResolvedValue(0);
    mockPrismaUser.findUnique.mockResolvedValue({ productContext: null });
  });

  it("emits sample company rows when no discovery provider is configured", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "any ICP", (e) => events.push(e));

    const companyEvents = events.filter((e) => e.type === "company");
    expect(companyEvents.length).toBeGreaterThan(0);

    for (const ev of companyEvents) {
      expect(ev.company?.isSample).toBe(true);
      expect(ev.company?.status).toBe("sample");
    }
  });

  it("still emits a done event with no providers", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "any ICP", (e) => events.push(e));

    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
  });

  it("does NOT call createEntity for sample companies", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "any ICP", (e) => events.push(e));

    expect(mockCreateEntity).not.toHaveBeenCalled();
  });

  it("still saves productContext even with no providers", async () => {
    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "dental clinics in Texas", (e) => events.push(e));

    expect(mockPrismaUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productContext: "dental clinics in Texas" }),
      }),
    );
  });
});

// --------------------------------------------------------------------------
// Tests: provider errors (graceful recovery)
// --------------------------------------------------------------------------

describe("runWelcomeOrchestration - provider errors (graceful recovery)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsExaConfigured.mockReturnValue(true);
    mockIsExploriumConfigured.mockReturnValue(true);
    mockIsPipe0Configured.mockReturnValue(true);

    mockPrismaEntity.findMany.mockResolvedValue([]);
    mockPrismaEntity.count.mockResolvedValue(0);
    mockPrismaUser.findUnique.mockResolvedValue({ productContext: null });
    mockPrismaEntity.findUnique.mockResolvedValue({
      id: "e1",
      userId: "user-1",
      enrichment: null,
      industry: null,
      location: null,
      phone: null,
      description: null,
      website: null,
    });
  });

  it("still emits a done event when exaFindCompanies throws", async () => {
    mockExaFindCompanies.mockRejectedValue(new Error("network error"));

    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "B2B SaaS", (e) => events.push(e));

    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
  });

  it("continues and emits a done event after enrichDomain fails", async () => {
    mockExaFindCompanies.mockResolvedValue([
      { companyName: "Fails Corp", domain: "fails.com", website: "https://fails.com", sourceUrl: "https://fails.com" },
      { companyName: "Works Corp", domain: "works.com", website: "https://works.com", sourceUrl: "https://works.com" },
    ]);
    mockEnrichDomain.mockRejectedValue(new Error("enrichment down"));
    mockGetCompanyNews.mockResolvedValue({});

    const events: WelcomeEvent[] = [];
    await runWelcomeOrchestration("user-1", "B2B", (e) => events.push(e));

    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();

    // Should emit at least one error event for the failing enrichment.
    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents.length).toBeGreaterThan(0);
  });
});
