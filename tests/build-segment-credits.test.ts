// Proves buildSmartSegment (the MCP build_smart_segment tool) meters the
// up-to-~200-text OpenAI embedding call it makes via buildSegmentMatches:
// gated on credits BEFORE the paid call, debited only after a segment is
// actually built, and never charged on a miss (no eligible prospects, or
// nothing matched).

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
vi.mock("@/lib/credits", () => ({ ensureCredits, spendCredits }));

const { buildSegmentMatches } = vi.hoisted(() => ({ buildSegmentMatches: vi.fn() }));
vi.mock("@/lib/segment-build", () => ({ buildSegmentMatches }));

const { segmentCreate, contactSegmentCreateMany } = vi.hoisted(() => ({
  segmentCreate: vi.fn(),
  contactSegmentCreateMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    segment: { create: segmentCreate },
    contactSegment: { createMany: contactSegmentCreateMany },
  },
}));

import { buildSmartSegment } from "@/lib/field-operations";
import { OpError } from "@/lib/crm-operations";

const USER = "user-1";

describe("buildSmartSegment credit metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    process.env.OPENAI_API_KEY = "test-key";
    segmentCreate.mockResolvedValue({ id: "seg-1" });
    contactSegmentCreateMany.mockResolvedValue({ count: 2 });
  });

  it("gates on credits BEFORE the OpenAI call, then debits build_segment after a real match", async () => {
    buildSegmentMatches.mockImplementation(async () => {
      callOrder.push("buildSegmentMatches");
      return {
        matches: [
          { contactId: "c1", score: 0.9 },
          { contactId: "c2", score: 0.8 },
        ],
        eligibleCount: 5,
      };
    });

    const result = await buildSmartSegment(USER, { goal: "cold outreach targets" });

    expect(ensureCredits).toHaveBeenCalledWith(USER, "build_segment");
    expect(spendCredits).toHaveBeenCalledWith(USER, "build_segment");
    expect(callOrder).toEqual(["ensureCredits", "buildSegmentMatches", "spendCredits"]);
    expect(result).toMatchObject({ matched: 2, eligible: 5 });
  });

  it("never charges on a miss - no eligible prospects", async () => {
    buildSegmentMatches.mockImplementation(async () => {
      callOrder.push("buildSegmentMatches");
      return { matches: [], eligibleCount: 0 };
    });

    await expect(buildSmartSegment(USER, { goal: "nobody matches this" })).rejects.toMatchObject({
      name: "OpError",
      status: 422,
    });

    expect(ensureCredits).toHaveBeenCalledWith(USER, "build_segment");
    expect(spendCredits).not.toHaveBeenCalled();
    expect(segmentCreate).not.toHaveBeenCalled();
  });

  it("never charges on a miss - eligible prospects exist but nothing matched", async () => {
    buildSegmentMatches.mockImplementation(async () => {
      callOrder.push("buildSegmentMatches");
      return { matches: [], eligibleCount: 10 };
    });

    await expect(buildSmartSegment(USER, { goal: "impossible goal" })).rejects.toMatchObject({
      name: "OpError",
      status: 422,
    });

    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("blocks with a 402 OpError when the user is out of credits, before any OpenAI spend", async () => {
    ensureCredits.mockImplementation(async () => {
      callOrder.push("ensureCredits");
      throw new OpError("Out of credits. Upgrade your plan or wait for your monthly reset.", 402);
    });

    await expect(buildSmartSegment(USER, { goal: "anything" })).rejects.toMatchObject({
      name: "OpError",
      status: 402,
    });

    // The gate fired before the paid embedding call was ever made.
    expect(buildSegmentMatches).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });
});
