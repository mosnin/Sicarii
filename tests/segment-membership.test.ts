// createSegment accepts a caller-supplied contactIds list. The only safe
// behavior is to resolve those ids against THIS user's contacts and persist
// only the ones they own. Without that fence an agent (or a crafted MCP
// call) could attach a stranger's contact id to a segment and later read it
// back through get_segment / build_smart_segment.
//
// addToPipeline has the same owned-id filter; #80 already pins the
// non-owner-pipeline and foreign-segment cases. This file pins the
// remaining "stolen id in the list" case for both writes.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindMany = vi.fn();
const segmentCreate = vi.fn();
const contactSegmentCreateMany = vi.fn();
const pipelineFindUnique = vi.fn();
const pipelineEntryCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findMany: (...args: unknown[]) => contactFindMany(...args),
    },
    segment: {
      create: (...args: unknown[]) => segmentCreate(...args),
    },
    contactSegment: {
      createMany: (...args: unknown[]) => contactSegmentCreateMany(...args),
    },
    pipeline: {
      findUnique: (...args: unknown[]) => pipelineFindUnique(...args),
    },
    pipelineEntry: {
      createMany: (...args: unknown[]) => pipelineEntryCreateMany(...args),
    },
  },
}));

import { createSegment, addToPipeline } from "@/lib/field-operations";

const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  segmentCreate.mockResolvedValue({ id: "s1", userId: USER, name: "VIPs" });
  contactSegmentCreateMany.mockResolvedValue({ count: 1 });
  pipelineFindUnique.mockResolvedValue({ id: "p1", userId: USER });
  pipelineEntryCreateMany.mockResolvedValue({ count: 1 });
  contactFindMany.mockResolvedValue([{ id: "c-owned" }]);
});

describe("createSegment owned-id filter", () => {
  it("asks prisma for this user's ids only, then writes only the rows it got back", async () => {
    await createSegment(USER, { name: "VIPs", contactIds: ["c-owned", "c-stolen"] });

    expect(contactFindMany).toHaveBeenCalledWith({
      where: { userId: USER, id: { in: ["c-owned", "c-stolen"] } },
      select: { id: true },
    });
    expect(contactSegmentCreateMany).toHaveBeenCalledWith({
      data: [{ segmentId: "s1", contactId: "c-owned" }],
      skipDuplicates: true,
    });
  });

  it("creates the segment with no members when none of the supplied ids are owned", async () => {
    contactFindMany.mockResolvedValue([]);
    await createSegment(USER, { name: "Empty", contactIds: ["c-stolen"] });
    expect(contactSegmentCreateMany).toHaveBeenCalledWith({
      data: [],
      skipDuplicates: true,
    });
  });
});

describe("addToPipeline owned-id filter", () => {
  it("never createMany's a contact id the caller does not own", async () => {
    contactFindMany.mockResolvedValue([{ id: "c-owned" }]);
    await addToPipeline(USER, "p1", { contactIds: ["c-owned", "c-stolen"] });

    expect(contactFindMany).toHaveBeenCalledWith({
      where: { userId: USER, id: { in: ["c-owned", "c-stolen"] } },
      select: { id: true },
    });
    const data = pipelineEntryCreateMany.mock.calls[0][0].data as { contactId: string }[];
    expect(data.map((row) => row.contactId)).toEqual(["c-owned"]);
    expect(data.every((row) => row.contactId !== "c-stolen")).toBe(true);
  });
});
