// The away-window Radar seed must be safe: idempotent, provider-gated, and it
// must never throw into the first-run flow. These pin the guards.

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  exaConfigured: true,
  existingMonitors: 0,
  createThrows: false,
};

const createMock = vi.fn(async (args: unknown) => {
  if (state.createThrows) throw new Error("db down");
  return args;
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    intentMonitor: {
      count: vi.fn(async () => state.existingMonitors),
      create: (args: unknown) => createMock(args),
    },
  },
}));

vi.mock("@/lib/exa", () => ({
  isExaConfigured: () => state.exaConfigured,
}));

import { maybeSeedIcpRadar } from "@/lib/radar-seed";

beforeEach(() => {
  state.exaConfigured = true;
  state.existingMonitors = 0;
  state.createThrows = false;
  createMock.mockClear();
});

describe("maybeSeedIcpRadar", () => {
  const ICP = "Series A fintech startups in the US";

  it("seeds a weekly monitor when all guards pass", async () => {
    const seeded = await maybeSeedIcpRadar("user-1", ICP);
    expect(seeded).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.frequency).toBe("weekly");
    expect(arg.data.active).toBe(true);
    expect(arg.data.autoAdd).toBe(true);
    expect(arg.data.userId).toBe("user-1");
    // First run is scheduled in the near future, not immediately or a week out.
    const next = arg.data.nextRunAt as Date;
    const hoursOut = (next.getTime() - Date.now()) / 3_600_000;
    expect(hoursOut).toBeGreaterThan(0);
    expect(hoursOut).toBeLessThan(24);
  });

  it("is idempotent: does nothing when the user already has a monitor", async () => {
    state.existingMonitors = 1;
    expect(await maybeSeedIcpRadar("user-1", ICP)).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("is provider-gated: does nothing without an EXA key", async () => {
    state.exaConfigured = false;
    expect(await maybeSeedIcpRadar("user-1", ICP)).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("skips a too-vague ICP", async () => {
    expect(await maybeSeedIcpRadar("user-1", "b2b")).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("never throws: a DB failure returns false", async () => {
    state.createThrows = true;
    await expect(maybeSeedIcpRadar("user-1", ICP)).resolves.toBe(false);
  });
});
