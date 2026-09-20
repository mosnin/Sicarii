// The away-window Radar seed must be safe: idempotent, provider-gated, and it
// must never throw into the first-run flow. These pin the guards.

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  exaConfigured: true,
  existingMonitors: 0,
  createThrows: false,
  keyCollision: false, // simulate the exactly-once race (P2002 on the idempotency key)
  autoRadar: true, // the user's opt-out preference
};

const monitorCreateMock = vi.fn(async (args: unknown) => {
  if (state.createThrows) throw new Error("db down");
  return args;
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ autoRadar: state.autoRadar })),
    },
    intentMonitor: {
      count: vi.fn(async () => state.existingMonitors),
    },
    // $transaction runs the callback with a tx client; the idempotency-key
    // insert is the exactly-once gate (P2002 => the whole thing rolls back).
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        idempotencyKey: {
          create: vi.fn(async () => {
            if (state.keyCollision) {
              const err = new Error("Unique constraint failed") as Error & { code: string };
              err.code = "P2002";
              throw err;
            }
            return {};
          }),
        },
        intentMonitor: { create: (args: unknown) => monitorCreateMock(args) },
      };
      return fn(tx);
    }),
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
  state.keyCollision = false;
  state.autoRadar = true;
  monitorCreateMock.mockClear();
});

describe("maybeSeedIcpRadar", () => {
  const ICP = "Series A fintech startups in the US";

  it("seeds a weekly monitor when all guards pass", async () => {
    const seeded = await maybeSeedIcpRadar("user-1", ICP);
    expect(seeded).toBe(true);
    expect(monitorCreateMock).toHaveBeenCalledTimes(1);
    const arg = monitorCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
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
    expect(monitorCreateMock).not.toHaveBeenCalled();
  });

  it("race-safe: a concurrent seed (P2002 on the key) creates no duplicate", async () => {
    state.keyCollision = true;
    expect(await maybeSeedIcpRadar("user-1", ICP)).toBe(false);
    // The transaction rolls back; no monitor is committed.
  });

  it("respects the user's opt-out (autoRadar = false)", async () => {
    state.autoRadar = false;
    expect(await maybeSeedIcpRadar("user-1", ICP)).toBe(false);
    expect(monitorCreateMock).not.toHaveBeenCalled();
  });

  it("marks the created monitor autoSeeded so the toggle can find it", async () => {
    await maybeSeedIcpRadar("user-1", ICP);
    const arg = monitorCreateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.autoSeeded).toBe(true);
  });

  it("is provider-gated: does nothing without an EXA key", async () => {
    state.exaConfigured = false;
    expect(await maybeSeedIcpRadar("user-1", ICP)).toBe(false);
    expect(monitorCreateMock).not.toHaveBeenCalled();
  });

  it("skips a too-vague ICP", async () => {
    expect(await maybeSeedIcpRadar("user-1", "b2b")).toBe(false);
    expect(monitorCreateMock).not.toHaveBeenCalled();
  });

  it("never throws: a DB failure returns false", async () => {
    state.createThrows = true;
    await expect(maybeSeedIcpRadar("user-1", ICP)).resolves.toBe(false);
  });
});
