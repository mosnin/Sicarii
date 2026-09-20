// Tenant-isolation boundary tests for the Field ops layer (segments +
// pipelines) - see tests/ops-isolation.test.ts for the full rationale. This
// file covers the lifecycle/cleanup functions added alongside the audit gap
// "agents can create Segment/Pipeline objects but never clean them up":
// updateSegment, deleteSegment, removeSegmentMember, deletePipeline, and
// removePipelineEntry. With prisma mocked to return a record owned by USER A,
// every function called as USER B must throw a 404 OpError and must NEVER
// reach a mutation (update/delete/deleteMany).

import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

vi.mock("@/lib/prisma", () => {
  // Inlined inside the factory: vi.mock is hoisted above module-level consts.
  const owner = "user-A";
  const forbid = (name: string) =>
    vi.fn(() => {
      throw new Error(`ISOLATION BREACH: ${name} was called on an unauthorized record`);
    });
  return {
    prisma: {
      segment: {
        findUnique: vi.fn().mockResolvedValue({ id: "s1", userId: owner, name: "VIPs", goal: null }),
        update: forbid("segment.update"),
        delete: forbid("segment.delete"),
      },
      contactSegment: {
        deleteMany: forbid("contactSegment.deleteMany"),
      },
      pipeline: {
        findUnique: vi.fn().mockResolvedValue({ id: "p1", userId: owner, name: "Q3" }),
        update: forbid("pipeline.update"),
        delete: forbid("pipeline.delete"),
      },
      pipelineEntry: {
        findUnique: vi.fn().mockResolvedValue({ id: "e1", userId: owner, pipelineId: "p1", stage: "NEW" }),
        update: forbid("pipelineEntry.update"),
        delete: forbid("pipelineEntry.delete"),
      },
    },
  };
});

import {
  updateSegment,
  deleteSegment,
  removeSegmentMember,
  deletePipeline,
  removePipelineEntry,
} from "@/lib/field-operations";
import { OpError } from "@/lib/crm-operations";

async function expectDenied(fn: () => Promise<unknown>) {
  await expect(fn()).rejects.toMatchObject({
    name: "OpError",
    status: 404,
  });
}

describe("field-operations tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updateSegment denies a non-owner", async () => {
    await expectDenied(() => updateSegment(ATTACKER, "s1", { name: "hacked" }));
  });

  it("deleteSegment denies a non-owner", async () => {
    await expectDenied(() => deleteSegment(ATTACKER, "s1"));
  });

  it("removeSegmentMember denies a non-owner of the segment", async () => {
    await expectDenied(() => removeSegmentMember(ATTACKER, "s1", "c1"));
  });

  it("deletePipeline denies a non-owner", async () => {
    await expectDenied(() => deletePipeline(ATTACKER, "p1"));
  });

  it("removePipelineEntry denies a non-owner of the parent pipeline", async () => {
    await expectDenied(() => removePipelineEntry(ATTACKER, "p1", "e1"));
  });

  it("removePipelineEntry denies when the entry belongs to a different pipeline than requested", async () => {
    // Owner-matched but pipelineId mismatch must also 404, mirroring
    // updatePipelineEntry's existing check.
    await expectDenied(() => removePipelineEntry(OWNER, "other-pipeline", "e1"));
  });
});

describe("field-operations: owner is allowed through the ownership gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updateSegment resolves for the real owner (not a blanket deny)", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.segment.update as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      id: "s1",
      userId: OWNER,
      name: "renamed",
    });
    await expect(updateSegment(OWNER, "s1", { name: "renamed" })).resolves.toMatchObject({ id: "s1" });
  });

  it("deleteSegment resolves for the real owner", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.segment.delete as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ id: "s1" });
    await expect(deleteSegment(OWNER, "s1")).resolves.toEqual({ ok: true });
  });

  it("deletePipeline resolves for the real owner", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.pipeline.delete as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ id: "p1" });
    await expect(deletePipeline(OWNER, "p1")).resolves.toEqual({ ok: true });
  });

  it("removePipelineEntry resolves for the real owner with matching pipelineId", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.pipelineEntry.delete as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ id: "e1" });
    await expect(removePipelineEntry(OWNER, "p1", "e1")).resolves.toEqual({ ok: true });
  });
});

// A tiny sanity check that OpError carries the status the routes rely on
// (mirrors tests/ops-isolation.test.ts; kept local so this file is self
// sufficient if run in isolation).
describe("OpError", () => {
  it("defaults to 400 and carries an explicit status", () => {
    expect(new OpError("x").status).toBe(400);
    expect(new OpError("y", 404).status).toBe(404);
  });
});
