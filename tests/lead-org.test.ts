// Lead organization lives on the existing Contact model. These tests pin
// the shared where-builder: every filter is a first-class field or join,
// and userId is never dropped.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindMany = vi.fn().mockResolvedValue([]);
const teamMemberFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findMany: (...a: unknown[]) => contactFindMany(...a) },
    teamMember: { findFirst: (...a: unknown[]) => teamMemberFindFirst(...a) },
  },
}));

import {
  contactListWhere,
  normalizeList,
  assertAssignableOwner,
  CONTACT_STATUSES,
  PIPELINE_STAGES,
} from "@/lib/lead-org";
import { listContacts } from "@/lib/crm-operations";
import { OpError } from "@/lib/op-error";

beforeEach(() => {
  contactFindMany.mockClear();
  teamMemberFindFirst.mockReset();
});

describe("contactListWhere", () => {
  it("always scopes to userId, even with no filters", () => {
    expect(contactListWhere("tenant-1")).toEqual({ userId: "tenant-1" });
  });

  it("never drops userId when org filters are set", () => {
    const where = contactListWhere("tenant-1", {
      status: "QUALIFIED",
      source: "linkedin",
      tag: "hot",
      list: "inbound",
      ownerId: "member-9",
      segmentId: "seg-1",
      pipelineId: "pipe-1",
      stage: "ENGAGING",
      q: "Ada",
    });
    expect(where.userId).toBe("tenant-1");
    expect(where.status).toBe("QUALIFIED");
    expect(where.source).toBe("linkedin");
    expect(where.tags).toEqual({ has: "hot" });
    expect(where.list).toBe("inbound");
    expect(where.ownerId).toBe("member-9");
    expect(where.segments).toEqual({ some: { segmentId: "seg-1" } });
    expect(where.pipelineEntries).toEqual({
      some: { pipelineId: "pipe-1", stage: "ENGAGING" },
    });
    expect(where.OR).toBeDefined();
  });

  it("ignores unknown status and stage values instead of filtering wrong", () => {
    const where = contactListWhere("tenant-1", {
      status: "NOT_A_STATUS",
      stage: "NOT_A_STAGE",
    });
    expect(where.status).toBeUndefined();
    expect(where.pipelineEntries).toBeUndefined();
  });

  it("filters pipeline stage without a pipeline id", () => {
    const where = contactListWhere("tenant-1", { stage: "WON" });
    expect(where.pipelineEntries).toEqual({ some: { stage: "WON" } });
  });

  it("exposes the full status and stage vocabularies", () => {
    expect(CONTACT_STATUSES).toContain("WON");
    expect(CONTACT_STATUSES).toContain("LOST");
    expect(PIPELINE_STAGES).toContain("PROSPECTING");
  });
});

describe("normalizeList", () => {
  it("trims, caps length, and treats blank as clear", () => {
    expect(normalizeList(undefined)).toBeUndefined();
    expect(normalizeList(null)).toBeNull();
    expect(normalizeList("  inbound  ")).toBe("inbound");
    expect(normalizeList("   ")).toBeNull();
    expect(normalizeList("x".repeat(100))?.length).toBe(80);
  });
});

describe("listContacts uses the shared where-builder", () => {
  it("passes org filters through and keeps the tenant scope", async () => {
    await listContacts("tenant-1", {
      status: "CONTACTED",
      source: "manual",
      tag: "vip",
      list: "west",
      ownerId: "owner-1",
      segmentId: "seg-2",
      stage: "ENGAGING",
      limit: 10,
    });
    expect(contactFindMany).toHaveBeenCalledTimes(1);
    const arg = contactFindMany.mock.calls[0][0];
    expect(arg.where.userId).toBe("tenant-1");
    expect(arg.where.status).toBe("CONTACTED");
    expect(arg.where.source).toBe("manual");
    expect(arg.where.tags).toEqual({ has: "vip" });
    expect(arg.where.list).toBe("west");
    expect(arg.where.ownerId).toBe("owner-1");
    expect(arg.where.segments).toEqual({ some: { segmentId: "seg-2" } });
    expect(arg.where.pipelineEntries).toEqual({ some: { stage: "ENGAGING" } });
    expect(arg.take).toBe(10);
  });
});

describe("assertAssignableOwner", () => {
  it("allows the tenant themselves and skips empty", async () => {
    await expect(assertAssignableOwner("tenant-1", "tenant-1")).resolves.toBeUndefined();
    await expect(assertAssignableOwner("tenant-1", null)).resolves.toBeUndefined();
    expect(teamMemberFindFirst).not.toHaveBeenCalled();
  });

  it("allows a workspace member and rejects a stranger", async () => {
    teamMemberFindFirst.mockResolvedValueOnce({ id: "m1" });
    await expect(assertAssignableOwner("tenant-1", "member-2")).resolves.toBeUndefined();
    expect(teamMemberFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: "tenant-1", userId: "member-2" },
      select: { id: true },
    });

    teamMemberFindFirst.mockResolvedValueOnce(null);
    await expect(assertAssignableOwner("tenant-1", "stranger")).rejects.toBeInstanceOf(OpError);
  });
});
