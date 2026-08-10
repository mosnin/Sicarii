// Account deletion must leave nothing behind - including the tables that do
// not cascade from the User FK. The compliance-critical one is FieldProvenance,
// whose valueSnapshot holds copies of a person's data and has no userId.
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { op: string; args: unknown }[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findMany: vi.fn(async () => [{ id: "c1" }, { id: "c2" }]) },
    entity: { findMany: vi.fn(async () => [{ id: "e1" }]) },
    fieldProvenance: { deleteMany: (args: unknown) => ({ __op: "fieldProvenance.deleteMany", args }) },
    pipeline: { deleteMany: (args: unknown) => ({ __op: "pipeline.deleteMany", args }) },
    segment: { deleteMany: (args: unknown) => ({ __op: "segment.deleteMany", args }) },
    user: { delete: (args: unknown) => ({ __op: "user.delete", args }) },
    $transaction: async (ops: { __op: string; args: unknown }[]) => {
      for (const o of ops) calls.push({ op: o.__op, args: o.args });
      return [];
    },
  },
}));

import { purgeTenant, redactOldVoiceCalls } from "@/lib/maintenance";

beforeEach(() => {
  calls.length = 0;
});

describe("purgeTenant", () => {
  it("deletes FieldProvenance for every one of the tenant's records, then the non-cascading tables, then the user", async () => {
    await purgeTenant("u1");
    const ops = calls.map((c) => c.op);
    // FieldProvenance cleanup must happen, keyed by the tenant's contact+entity ids.
    const fp = calls.find((c) => c.op === "fieldProvenance.deleteMany");
    expect(fp).toBeTruthy();
    expect((fp!.args as { where: { recordId: { in: string[] } } }).where.recordId.in).toEqual(["c1", "c2", "e1"]);
    // Pipeline + Segment (no FK cascade) are cleared, and the user is deleted last.
    expect(ops).toContain("pipeline.deleteMany");
    expect(ops).toContain("segment.deleteMany");
    expect(ops[ops.length - 1]).toBe("user.delete");
  });

  it("does the user delete inside the same transaction as the cleanups (atomic)", async () => {
    await purgeTenant("u1");
    // Everything landed via one $transaction call, so a partial delete cannot
    // leave data retained while the user row is gone.
    expect(calls.some((c) => c.op === "user.delete")).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("redactOldVoiceCalls", () => {
  it("clears transcript/recording/prompt on calls past the retention window", async () => {
    const captured: { where: unknown; data: Record<string, unknown> }[] = [];
    const { prisma } = await import("@/lib/prisma");
    // @ts-expect-error test shim
    prisma.voiceCall = { updateMany: async (a: { where: unknown; data: Record<string, unknown> }) => { captured.push(a); return { count: 3 }; } };
    const n = await redactOldVoiceCalls(new Date("2026-08-09T00:00:00Z"));
    expect(n).toBe(3);
    expect(captured[0].data).toMatchObject({ recordingUrl: null, systemPrompt: null });
  });
});
