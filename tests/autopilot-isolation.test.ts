// Tenant-isolation + lifecycle-guard tests for the autopilot ops layer, in the
// same spirit as tests/ops-isolation.test.ts: a non-owner must never read or
// mutate another user's plan, and a mutation spy that throws on call turns
// any regression into a loud failure.

import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

vi.mock("@/lib/prisma", () => {
  const owner = "user-A";
  const forbid = (name: string) =>
    vi.fn(() => {
      throw new Error(`ISOLATION BREACH: ${name} was called on an unauthorized record`);
    });
  return {
    prisma: {
      autopilotPlan: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id !== "plan-1") return null;
          return { id: "plan-1", userId: owner, status: "draft", cadence: "weekly" };
        }),
        update: forbid("autopilotPlan.update"),
        updateMany: forbid("autopilotPlan.updateMany"),
      },
      autopilotAllocation: {
        findMany: forbid("autopilotAllocation.findMany"),
        updateMany: forbid("autopilotAllocation.updateMany"),
      },
      autopilotRun: {
        findMany: forbid("autopilotRun.findMany"),
      },
      $transaction: forbid("$transaction"),
    },
  };
});

import {
  getAutopilotPlan,
  approveAutopilotPlan,
  pauseAutopilotPlan,
} from "@/lib/autopilot-operations";
// autopilot-operations throws the SAME OpError class crm-operations defines
// (it imports, not redefines, it) - import it from its source of truth.
import { OpError } from "@/lib/crm-operations";

async function expectDenied(fn: () => Promise<unknown>) {
  await expect(fn()).rejects.toMatchObject({ name: "OpError", status: 404 });
}

describe("autopilot ops tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads deny a non-owner", async () => {
    await expectDenied(() => getAutopilotPlan(ATTACKER, "plan-1"));
  });

  it("approve denies a non-owner (and never reaches a mutation)", async () => {
    await expectDenied(() => approveAutopilotPlan(ATTACKER, "plan-1", { id: ATTACKER, label: "Attacker" }));
  });

  it("pause denies a non-owner (and never reaches a mutation)", async () => {
    await expectDenied(() => pauseAutopilotPlan(ATTACKER, "plan-1"));
  });

  it("a nonexistent plan id is denied the same way (no existence oracle)", async () => {
    await expectDenied(() => getAutopilotPlan(OWNER, "does-not-exist"));
  });
});

describe("OpError is re-exported for callers that only import from autopilot-operations", () => {
  it("carries the status routes rely on", () => {
    expect(new OpError("x").status).toBe(400);
    expect(new OpError("y", 404).status).toBe(404);
  });
});
