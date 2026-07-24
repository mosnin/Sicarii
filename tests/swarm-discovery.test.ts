// Swarm discovery: fan a broad goal out into N distinct search angles, run
// them blind to each other, merge across angles AND dedupe against the CRM,
// and gate/debit credits per the "never charge a miss" policy applied to a
// whole fan-out (gate for the ceiling, debit per angle that actually hits).
//
// Two layers are tested:
//  - Pure merge logic (mergeAngleResults, clampAngleCount) directly, no mocks.
//  - swarmDiscover end-to-end with prisma/exa mocked, proving dedup across
//    angles, dedup against the CRM, the credit gate/debit policy, angle-count
//    capping, and tenant isolation on getSwarmRun.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    creditLedger: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(0),
    entity: { findMany: vi.fn(), createManyAndReturn: vi.fn() },
    swarmRun: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/exa", () => ({
  exaFindCompanies: vi.fn(),
  isExaConfigured: vi.fn(() => true),
}));

import { prisma } from "@/lib/prisma";
import { exaFindCompanies, isExaConfigured } from "@/lib/exa";
import { swarmDiscover, getSwarmRun, OpError } from "@/lib/crm-operations";
import { mergeAngleResults, clampAngleCount, MIN_ANGLES, MAX_ANGLES, DEFAULT_ANGLES } from "@/lib/swarm";
import type { FoundCompany } from "@/lib/exa";

const USER = "user-1";
const ATTACKER = "user-2";

function company(name: string, domain?: string): FoundCompany {
  return { companyName: name, domain, sourceUrl: `https://${domain ?? name}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  (isExaConfigured as ReturnType<typeof vi.fn>).mockReturnValue(true);
  // Plenty of credits by default; individual tests override for the gating cases.
  (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ creditsRemaining: 1000 });
  (prisma.user.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
  // No pre-existing CRM entities unless a test seeds them.
  (prisma.entity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.entity.createManyAndReturn as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ data }: { data: { name: string; domain: string | null }[] }) =>
      data.map((d, i) => ({ id: `new-${i}`, name: d.name, domain: d.domain })),
  );
  (prisma.swarmRun.create as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: "run-1", ...data }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Pure merge logic (no mocks needed) ──────────────────────────────────────

describe("mergeAngleResults", () => {
  it("collapses the same company found by two angles into one entry with both angles attributed", () => {
    const { merged, totalFound } = mergeAngleResults([
      { angle: "angle A", companies: [company("Acme", "acme.com")] },
      { angle: "angle B", companies: [company("Acme Inc", "acme.com")] }, // same domain, different name
    ]);
    expect(totalFound).toBe(2);
    expect(merged).toHaveLength(1);
    expect(merged[0].angles.sort()).toEqual(["angle A", "angle B"]);
  });

  it("keeps distinct companies from different angles separate", () => {
    const { merged, totalFound } = mergeAngleResults([
      { angle: "angle A", companies: [company("Acme", "acme.com")] },
      { angle: "angle B", companies: [company("Widgetco", "widgetco.com")] },
    ]);
    expect(totalFound).toBe(2);
    expect(merged).toHaveLength(2);
  });

  it("dedupes by name when no domain is present", () => {
    const { merged } = mergeAngleResults([
      { angle: "angle A", companies: [company("  Acme Corp  ")] },
      { angle: "angle B", companies: [company("acme corp")] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].angles).toEqual(["angle A", "angle B"]);
  });

  it("a company surfaced twice by the SAME angle only records that angle once", () => {
    const { merged } = mergeAngleResults([
      { angle: "angle A", companies: [company("Acme", "acme.com"), company("Acme", "acme.com")] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].angles).toEqual(["angle A"]);
  });
});

describe("clampAngleCount", () => {
  it("defaults when not given", () => {
    expect(clampAngleCount(undefined)).toBe(DEFAULT_ANGLES);
  });

  it("clamps below the minimum up to MIN_ANGLES", () => {
    expect(clampAngleCount(0)).toBe(MIN_ANGLES);
    expect(clampAngleCount(1)).toBe(MIN_ANGLES);
    expect(clampAngleCount(-5)).toBe(MIN_ANGLES);
  });

  it("clamps above the maximum down to MAX_ANGLES", () => {
    expect(clampAngleCount(9)).toBe(MAX_ANGLES);
    expect(clampAngleCount(100)).toBe(MAX_ANGLES);
  });

  it("passes through values already in range", () => {
    expect(clampAngleCount(3)).toBe(3);
  });
});

// ── swarmDiscover end-to-end (mocked prisma/exa) ────────────────────────────

describe("swarmDiscover", () => {
  it("is unavailable when Exa is not configured", async () => {
    (isExaConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false);
    await expect(swarmDiscover(USER, { goal: "g", angles: ["a"] })).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
  });

  it("auto-derivation is refused without OPENAI_API_KEY, and no explicit angles were given", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(swarmDiscover(USER, { goal: "Series A devtools companies" })).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
    expect(exaFindCompanies).not.toHaveBeenCalled();
  });

  it("caps an oversized explicit angle list at MAX_ANGLES", async () => {
    (exaFindCompanies as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const angles = Array.from({ length: 8 }, (_, i) => `angle ${i}`);
    const result = await swarmDiscover(USER, { goal: "g", angles });
    expect(result.angles).toHaveLength(MAX_ANGLES);
    expect(exaFindCompanies).toHaveBeenCalledTimes(MAX_ANGLES);
  });

  it("merges across angles: the same company found by two angles becomes ONE entity with both angles attributed", async () => {
    (exaFindCompanies as ReturnType<typeof vi.fn>).mockImplementation(async (query: string) => {
      if (query === "angle A") return [company("Acme", "acme.com")];
      if (query === "angle B") return [company("Acme Inc", "acme.com")];
      return [];
    });

    const result = await swarmDiscover(USER, { goal: "g", angles: ["angle A", "angle B"] });

    expect(result.found).toBe(2); // raw hits across angles
    expect(result.merged).toBe(1); // one unique company after cross-angle dedup
    expect(result.added).toBe(1); // one new entity created
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0].angles.sort()).toEqual(["angle A", "angle B"]);
    expect(result.companies[0].status).toBe("added");

    // Only ONE entity row was actually inserted, despite two angle hits.
    expect(prisma.entity.createManyAndReturn).toHaveBeenCalledTimes(1);
    const call = (prisma.entity.createManyAndReturn as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: unknown[];
    };
    expect(call.data).toHaveLength(1);
  });

  it("dedupes against an existing CRM entity by domain and never re-adds it", async () => {
    (prisma.entity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { domain: "acme.com", name: "Acme Corp" },
    ]);
    (exaFindCompanies as ReturnType<typeof vi.fn>).mockImplementation(async (query: string) =>
      query === "angle A" ? [company("Acme", "acme.com")] : [],
    );

    const result = await swarmDiscover(USER, { goal: "g", angles: ["angle A", "angle B"] });

    expect(result.merged).toBe(1);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.companies[0].status).toBe("duplicate");
    expect(result.companies[0].entityId).toBeNull();
    expect(prisma.entity.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("gates credits up front for the whole swarm (angle count x find_companies rate) BEFORE any provider call", async () => {
    // 2 angles at 12 credits each = 24 needed; only 12 available.
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ creditsRemaining: 12 });

    await expect(
      swarmDiscover(USER, { goal: "g", angles: ["angle A", "angle B"] }),
    ).rejects.toMatchObject({ name: "OpError", status: 402 });

    // The gate must fail BEFORE any paid Exa call is made.
    expect(exaFindCompanies).not.toHaveBeenCalled();
  });

  it("debits ONLY the angles that returned companies - an empty angle is never charged", async () => {
    (exaFindCompanies as ReturnType<typeof vi.fn>).mockImplementation(async (query: string) =>
      query === "angle A" ? [company("Acme", "acme.com")] : [], // angle B returns nothing
    );

    const result = await swarmDiscover(USER, { goal: "g", angles: ["angle A", "angle B"] });

    expect(result.perAngle).toEqual([
      { angle: "angle A", found: 1, credited: true },
      { angle: "angle B", found: 0, credited: false },
    ]);
    // Exactly one debit (the atomic decrement), not two.
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    expect(result.creditsSpent).toBe(12); // CREDIT_COSTS.find_companies, once
  });

  it("persists an auditable SwarmRun with the aggregate counts", async () => {
    (exaFindCompanies as ReturnType<typeof vi.fn>).mockImplementation(async (query: string) =>
      query === "angle A" ? [company("Acme", "acme.com")] : [],
    );
    await swarmDiscover(USER, { goal: "my goal", angles: ["angle A", "angle B"] });

    expect(prisma.swarmRun.create).toHaveBeenCalledTimes(1);
    const call = (prisma.swarmRun.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.userId).toBe(USER);
    expect(call.data.goal).toBe("my goal");
    expect(call.data.angleSource).toBe("explicit");
    expect(call.data.found).toBe(1);
    expect(call.data.added).toBe(1);
    expect(call.data.creditsSpent).toBe(12);
  });

  it("rejects an all-empty explicit angle list", async () => {
    await expect(swarmDiscover(USER, { goal: "g", angles: ["   ", ""] })).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(exaFindCompanies).not.toHaveBeenCalled();
  });
});

// ── Tenant isolation on the results surface ─────────────────────────────────

describe("getSwarmRun tenant isolation", () => {
  it("denies a non-owner and allows the real owner", async () => {
    (prisma.swarmRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "run-1",
      userId: USER,
      goal: "g",
    });

    await expect(getSwarmRun(ATTACKER, "run-1")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    await expect(getSwarmRun(USER, "run-1")).resolves.toMatchObject({ id: "run-1" });
  });

  it("404s on a missing run for anyone", async () => {
    (prisma.swarmRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(getSwarmRun(USER, "nope")).rejects.toBeInstanceOf(OpError);
  });
});
