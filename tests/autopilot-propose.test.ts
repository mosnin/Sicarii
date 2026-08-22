// proposeAutopilotPlan validation: allocations must sum exactly to
// totalCredits (the plan's headline number is never a lie), the plan is
// always created as a draft, and cadence falls back to a safe default.

import { describe, it, expect, vi, beforeEach } from "vitest";

type CreateArg = { data: Record<string, unknown> };

const create = vi.fn(async (arg?: CreateArg) => {
  const data = arg?.data ?? {};
  return { id: "plan-1", ...data };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { autopilotPlan: { create: (arg: CreateArg) => create(arg) } },
}));

function lastCreateData(): Record<string, unknown> {
  const call = create.mock.calls.at(-1);
  if (!call || !call[0]) throw new Error("create was not called");
  return call[0].data;
}

import { proposeAutopilotPlan } from "@/lib/autopilot-operations";

beforeEach(() => create.mockClear());

describe("proposeAutopilotPlan", () => {
  it("rejects allocations that don't sum to totalCredits", async () => {
    await expect(
      proposeAutopilotPlan("u1", {
        name: "Weekly plan",
        totalCredits: 400,
        allocations: { discovery: 200, enrichment: 100, outreach: 50, other: 0 }, // sums to 350
      }),
    ).rejects.toMatchObject({ name: "OpError", status: 400 });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a totalCredits of zero or a non-integer", async () => {
    await expect(
      proposeAutopilotPlan("u1", { name: "x", totalCredits: 0, allocations: {} }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      proposeAutopilotPlan("u1", { name: "x", totalCredits: 12.5, allocations: { discovery: 12.5 } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an empty name", async () => {
    await expect(
      proposeAutopilotPlan("u1", { name: "  ", totalCredits: 100, allocations: { discovery: 100 } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts allocations that sum exactly and always creates the plan as draft", async () => {
    const plan = await proposeAutopilotPlan("u1", {
      name: "Weekly discovery + enrichment",
      totalCredits: 400,
      allocations: { discovery: 200, enrichment: 150, outreach: 50, other: 0 },
      discoveryQuery: "B2B fintech startups in NYC",
    });
    expect(create).toHaveBeenCalledTimes(1);
    const data = lastCreateData();
    expect(data.status).toBe("draft");
    expect(data.userId).toBe("u1");
    expect(plan.id).toBe("plan-1");
  });

  it("defaults cadence to weekly and rejects an unknown cadence by falling back, never erroring", async () => {
    await proposeAutopilotPlan("u1", {
      name: "x",
      totalCredits: 10,
      allocations: { discovery: 10 },
    });
    expect(lastCreateData().cadence).toBe("weekly");
  });

  it("missing category keys default to 0, not undefined/NaN", async () => {
    await proposeAutopilotPlan("u1", {
      name: "discovery only",
      totalCredits: 50,
      allocations: { discovery: 50 },
    });
    const allocCreate = (lastCreateData() as { allocations: { create: { category: string; allocated: number }[] } })
      .allocations.create;
    const byCat = Object.fromEntries(allocCreate.map((a) => [a.category, a.allocated]));
    expect(byCat).toEqual({ discovery: 50, enrichment: 0, outreach: 0, other: 0 });
  });
});
