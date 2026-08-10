// The sequence engine's job is to run a cadence that ALWAYS stops on a reply or
// a suppression, and always sends through the safe chokepoint. These tests lock
// the state machine and the two stop conditions.
import { describe, it, expect, vi, beforeEach } from "vitest";

type SendArgs = [userId: string, input: { subject: string; body: string; contactId?: string | null }];
const send = vi.fn(async (..._a: SendArgs) => ({ sent: true as const }));
const enqueue = vi.fn(async (..._a: unknown[]) => ({ task: { id: "t1" }, deduped: false }));
let suppressed = false;

vi.mock("@/lib/email-send", () => ({ sendOutboundEmail: (...a: SendArgs) => send(...a) }));
vi.mock("@/lib/tasks", () => ({ enqueueTask: (...a: unknown[]) => enqueue(...a) }));
vi.mock("@/lib/suppression", () => ({
  checkSuppressed: async () => ({ suppressed, reason: suppressed ? "on the list" : undefined }),
}));

// A tiny in-memory enrollment the mocked prisma reads and writes.
const enrollment: Record<string, unknown> = {};
const updates: Record<string, unknown>[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sequenceEnrollment: {
      findFirst: async () => ({ ...enrollment }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(enrollment, data);
        updates.push(data);
        return { ...enrollment };
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(enrollment, data);
        updates.push(data);
        return { count: 1 };
      },
    },
  },
}));

import { runSequenceStep, stopEnrollmentsForContact } from "@/lib/sequences";

const twoSteps = [
  { order: 0, delayDays: 0, subject: "Hi", body: "First" },
  { order: 1, delayDays: 3, subject: "Following up", body: "Second" },
];

beforeEach(() => {
  vi.clearAllMocks();
  suppressed = false;
  updates.length = 0;
  Object.assign(enrollment, {
    id: "en1",
    userId: "u1",
    contactId: "c1",
    status: "ACTIVE",
    currentStep: 0,
    sequence: { active: true, steps: twoSteps },
    contact: { id: "c1", email: "p@target.com" },
  });
});

describe("runSequenceStep", () => {
  it("sends the current step and schedules the next", async () => {
    const r = await runSequenceStep("u1", "en1");
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1]).toMatchObject({ subject: "Hi", body: "First", contactId: "c1" });
    expect(enrollment.currentStep).toBe(1);
    expect(enqueue).toHaveBeenCalledOnce(); // next step queued
    expect(r.outcome).toContain("next step scheduled");
  });

  it("completes the enrollment after the final step, scheduling nothing", async () => {
    enrollment.currentStep = 1; // last step
    const r = await runSequenceStep("u1", "en1");
    expect(send).toHaveBeenCalledOnce();
    expect(enrollment.status).toBe("COMPLETED");
    expect(enqueue).not.toHaveBeenCalled();
    expect(r.outcome).toContain("completed");
  });

  it("STOPS the enrollment and never sends when the contact is suppressed", async () => {
    suppressed = true;
    const r = await runSequenceStep("u1", "en1");
    expect(send).not.toHaveBeenCalled();
    expect(enrollment.status).toBe("STOPPED");
    expect(enrollment.stoppedReason).toBe("suppressed");
    expect(r.outcome).toContain("suppressed");
  });

  it("does not send for a non-ACTIVE enrollment (already stopped/replied)", async () => {
    enrollment.status = "STOPPED";
    const r = await runSequenceStep("u1", "en1");
    expect(send).not.toHaveBeenCalled();
    expect(r.outcome).toContain("STOPPED");
  });

  it("defers (does not fail) when the daily cap refuses, keeping the enrollment ACTIVE", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("cap"), { status: 429 }));
    const r = await runSequenceStep("u1", "en1");
    expect(enrollment.status).toBe("ACTIVE"); // rolled back, not failed
    expect(enrollment.currentStep).toBe(0); // claim rolled back to this step
    expect(enqueue).toHaveBeenCalled(); // a retry task is scheduled
    expect(r.outcome).toContain("deferred");
  });

  it("stops the enrollment on a non-transient send failure", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("bad recipient"), { status: 400 }));
    const r = await runSequenceStep("u1", "en1");
    expect(enrollment.status).toBe("FAILED");
    expect(r.outcome).toContain("failed");
  });
});

describe("stopEnrollmentsForContact", () => {
  it("flips active enrollments to STOPPED with a reason", async () => {
    const n = await stopEnrollmentsForContact("u1", "c1", "replied");
    expect(n).toBe(1);
    expect(enrollment.status).toBe("STOPPED");
    expect(enrollment.stoppedReason).toBe("replied");
  });
});

describe("runSequenceStep idempotency (the double-send / dead-cadence fixes)", () => {
  it("schedules the next step with a per-step ref so it cannot dedupe against the current task", async () => {
    await runSequenceStep("u1", "en1");
    const call = enqueue.mock.calls.find(Boolean);
    expect(call).toBeTruthy();
    // enqueueTask(userId, { ref })
    const arg = call![1] as { ref?: string; payload?: { stepOrder?: number } };
    expect(arg.ref).toBe("en1:1"); // enrollmentId:nextStep, unique per step
  });

  it("skips without sending when the step was already claimed by another run", async () => {
    // Simulate the claim losing the race: updateMany reports 0 rows advanced.
    const { prisma } = await import("@/lib/prisma");
    const orig = prisma.sequenceEnrollment.updateMany;
    // @ts-expect-error test shim
    prisma.sequenceEnrollment.updateMany = async () => ({ count: 0 });
    const r = await runSequenceStep("u1", "en1");
    expect(send).not.toHaveBeenCalled();
    expect(r.outcome).toContain("already claimed");
    prisma.sequenceEnrollment.updateMany = orig;
  });
})
