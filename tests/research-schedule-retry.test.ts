// A due research schedule that fails AFTER spendCredits used to stay due, so
// the next hourly sweep charged 18 credits again. These tests pin the policy
// the other crons already have: once a run is attempted, nextRunAt advances
// even when the provider throws.

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  linkupConfigured: true,
  exaConfigured: false,
  due: [] as Array<Record<string, unknown>>,
  spendThrows: false as Error | false,
  researchThrows: false as Error | false,
  spendCalls: 0,
  updates: [] as Array<{ id: string; data: Record<string, unknown> }>,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    researchSchedule: {
      findMany: vi.fn(async () => state.due),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updates.push({ id: where.id, data });
        return { id: where.id, ...data };
      }),
    },
    entity: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () => null),
      create: vi.fn(),
    },
    contact: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user: {
      findUnique: vi.fn(async () => ({ taskWebhookUrl: null })),
    },
  },
}));

vi.mock("@/lib/credits", () => ({
  spendCredits: vi.fn(async () => {
    state.spendCalls += 1;
    if (state.spendThrows) throw state.spendThrows;
  }),
}));

vi.mock("@/lib/linkup", () => ({
  isLinkupConfigured: () => state.linkupConfigured,
  linkupDeepResearch: vi.fn(async () => {
    if (state.researchThrows) throw state.researchThrows;
    return { answer: "ok", sources: [{ url: "https://example.com", title: "Example", snippet: "n" }] };
  }),
  linkupSearch: vi.fn(async () => {
    if (state.researchThrows) throw state.researchThrows;
    return { answer: "ok", sources: [] };
  }),
}));

vi.mock("@/lib/exa", () => ({
  isExaConfigured: () => state.exaConfigured,
  isMeaningful: (s: unknown) => typeof s === "string" && s.trim().length > 0,
  exaIntentSearch: vi.fn(async () => {
    if (state.researchThrows) throw state.researchThrows;
    return [];
  }),
}));

vi.mock("@/lib/notify", () => ({
  notifyTaskWebhook: vi.fn(async () => {}),
}));

vi.mock("@/lib/creation-guard", () => ({
  checkCreationBudget: vi.fn(async () => ({ ok: true, recent: 0, limit: 1000, windowMinutes: 10 })),
}));

import { nextScheduleRunAt, processDueResearchSchedules } from "@/lib/research-schedule-run";

function dueSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: "sched-1",
    userId: "user-1",
    name: "Acme watch",
    query: "Acme Corp",
    provider: "linkup",
    depth: "deep",
    frequency: "hourly",
    targetType: "contact",
    targetId: "c1",
    ...overrides,
  };
}

beforeEach(() => {
  state.linkupConfigured = true;
  state.exaConfigured = false;
  state.due = [dueSchedule()];
  state.spendThrows = false;
  state.researchThrows = false;
  state.spendCalls = 0;
  state.updates = [];
});

describe("nextScheduleRunAt", () => {
  const now = new Date("2026-08-22T11:00:00.000Z");

  it("advances hourly by one hour", () => {
    expect(nextScheduleRunAt(now, "hourly").toISOString()).toBe("2026-08-22T12:00:00.000Z");
  });

  it("advances weekly by seven days", () => {
    expect(nextScheduleRunAt(now, "weekly").toISOString()).toBe("2026-08-29T11:00:00.000Z");
  });

  it("defaults other cadences to one day", () => {
    expect(nextScheduleRunAt(now, "daily").toISOString()).toBe("2026-08-23T11:00:00.000Z");
  });
});

describe("processDueResearchSchedules failure advance", () => {
  const now = new Date("2026-08-22T11:00:00.000Z");

  it("advances nextRunAt (not lastRunAt) when the provider throws after a debit", async () => {
    state.researchThrows = new Error("linkup 502");

    const result = await processDueResearchSchedules(now);

    expect(state.spendCalls).toBe(1);
    expect(result.updated).toBe(0);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].id).toBe("sched-1");
    expect(state.updates[0].data.lastRunAt).toBeUndefined();
    expect((state.updates[0].data.nextRunAt as Date).toISOString()).toBe("2026-08-22T12:00:00.000Z");
  });

  it("advances nextRunAt when spendCredits throws (out of credits)", async () => {
    state.spendThrows = Object.assign(new Error("Out of credits"), { status: 402 });

    await processDueResearchSchedules(now);

    expect(state.spendCalls).toBe(1);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data.lastRunAt).toBeUndefined();
    expect((state.updates[0].data.nextRunAt as Date).toISOString()).toBe("2026-08-22T12:00:00.000Z");
  });

  it("does not stay due: a later sweep that sees the new nextRunAt does not charge again", async () => {
    state.researchThrows = new Error("linkup 502");
    await processDueResearchSchedules(now);
    expect(state.spendCalls).toBe(1);

    const stamped = state.updates[0].data.nextRunAt as Date;
    state.due = [];
    if (stamped.getTime() <= now.getTime()) {
      throw new Error("nextRunAt was not pushed past the sweep time");
    }

    await processDueResearchSchedules(now);
    expect(state.spendCalls).toBe(1);
  });

  it("does not spend or advance when the provider is not configured", async () => {
    state.linkupConfigured = false;
    await processDueResearchSchedules(now);
    expect(state.spendCalls).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it("on success stamps lastRunAt and nextRunAt together", async () => {
    const result = await processDueResearchSchedules(now);
    expect(result.updated).toBe(1);
    expect(state.spendCalls).toBe(1);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data.lastRunAt).toEqual(now);
    expect((state.updates[0].data.nextRunAt as Date).toISOString()).toBe("2026-08-22T12:00:00.000Z");
  });
});
