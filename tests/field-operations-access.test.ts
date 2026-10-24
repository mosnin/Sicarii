// Field ops that isolation tests do not yet cover: reads (getSegment /
// getPipeline / pipelineMetrics), adds (addToPipeline), and validated
// writes (updatePipelineEntry). A miss here leaks another team's pipeline
// or lets an attacker stuff stolen contacts into their own board.

import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

const segmentFindUnique = vi.fn();
const pipelineFindUnique = vi.fn();
const pipelineEntryFindUnique = vi.fn();
const pipelineEntryFindMany = vi.fn();
const pipelineEntryCreateMany = vi.fn();
const pipelineEntryUpdate = vi.fn();
const contactFindMany = vi.fn();
const segmentCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    segment: {
      findUnique: (...a: unknown[]) => segmentFindUnique(...a),
      create: (...a: unknown[]) => segmentCreate(...a),
    },
    pipeline: {
      findUnique: (...a: unknown[]) => pipelineFindUnique(...a),
    },
    pipelineEntry: {
      findUnique: (...a: unknown[]) => pipelineEntryFindUnique(...a),
      findMany: (...a: unknown[]) => pipelineEntryFindMany(...a),
      createMany: (...a: unknown[]) => pipelineEntryCreateMany(...a),
      update: (...a: unknown[]) => pipelineEntryUpdate(...a),
    },
    contact: {
      findMany: (...a: unknown[]) => contactFindMany(...a),
    },
  },
}));

import {
  getSegment,
  getPipeline,
  addToPipeline,
  updatePipelineEntry,
  pipelineMetrics,
  createSegment,
} from "@/lib/field-operations";
import { OpError } from "@/lib/crm-operations";

async function expectDenied(fn: () => Promise<unknown>) {
  await expect(fn()).rejects.toMatchObject({ name: "OpError", status: 404 });
}

describe("field-operations read isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getSegment denies a non-owner and never returns members", async () => {
    segmentFindUnique.mockResolvedValue({
      id: "s1",
      userId: OWNER,
      members: [{ contactId: "c-secret" }],
    });
    await expectDenied(() => getSegment(ATTACKER, "s1"));
  });

  it("getSegment returns the segment for the real owner", async () => {
    const row = { id: "s1", userId: OWNER, members: [] };
    segmentFindUnique.mockResolvedValue(row);
    await expect(getSegment(OWNER, "s1")).resolves.toEqual(row);
  });

  it("getPipeline denies a non-owner", async () => {
    pipelineFindUnique.mockResolvedValue({
      id: "p1",
      userId: OWNER,
      entries: [{ contactId: "c-secret" }],
    });
    await expectDenied(() => getPipeline(ATTACKER, "p1"));
  });

  it("pipelineMetrics denies a non-owner and never lists entries", async () => {
    pipelineFindUnique.mockResolvedValue({ id: "p1", userId: OWNER, name: "Q3", goal: null });
    await expectDenied(() => pipelineMetrics(ATTACKER, "p1"));
    expect(pipelineEntryFindMany).not.toHaveBeenCalled();
  });
});

describe("addToPipeline isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies a non-owner of the pipeline before createMany", async () => {
    pipelineFindUnique.mockResolvedValue({ id: "p1", userId: OWNER });
    await expectDenied(() => addToPipeline(ATTACKER, "p1", { contactIds: ["c1"] }));
    expect(pipelineEntryCreateMany).not.toHaveBeenCalled();
    expect(contactFindMany).not.toHaveBeenCalled();
  });

  it("ignores a segment owned by someone else instead of importing its members", async () => {
    pipelineFindUnique.mockResolvedValue({ id: "p1", userId: OWNER });
    segmentFindUnique.mockResolvedValue({
      id: "s-stolen",
      userId: ATTACKER,
      members: [{ contactId: "c-stolen" }],
    });

    await expect(addToPipeline(OWNER, "p1", { segmentId: "s-stolen" })).rejects.toMatchObject({
      name: "OpError",
      status: 400,
      message: "No contacts to add",
    });
    expect(pipelineEntryCreateMany).not.toHaveBeenCalled();
  });
});

describe("updatePipelineEntry validation and isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelineEntryFindUnique.mockResolvedValue({
      id: "e1",
      userId: OWNER,
      pipelineId: "p1",
      stage: "NEW",
    });
  });

  it("denies a non-owner and never updates", async () => {
    await expectDenied(() =>
      updatePipelineEntry(ATTACKER, "p1", "e1", { stage: "WON" }),
    );
    expect(pipelineEntryUpdate).not.toHaveBeenCalled();
  });

  it("denies when the entry belongs to a different pipeline", async () => {
    await expectDenied(() =>
      updatePipelineEntry(OWNER, "other-pipeline", "e1", { stage: "WON" }),
    );
    expect(pipelineEntryUpdate).not.toHaveBeenCalled();
  });

  it("rejects an invalid stage before writing", async () => {
    await expect(
      updatePipelineEntry(OWNER, "p1", "e1", { stage: "HACKED" as "NEW" }),
    ).rejects.toMatchObject({ name: "OpError", status: 400, message: "Invalid stage" });
    expect(pipelineEntryUpdate).not.toHaveBeenCalled();
  });

  it("rejects a dealScore outside 0-100", async () => {
    await expect(
      updatePipelineEntry(OWNER, "p1", "e1", { dealScore: 101 }),
    ).rejects.toMatchObject({
      name: "OpError",
      status: 400,
      message: "dealScore must be 0-100",
    });
    await expect(
      updatePipelineEntry(OWNER, "p1", "e1", { dealScore: -1 }),
    ).rejects.toMatchObject({ name: "OpError", status: 400 });
    expect(pipelineEntryUpdate).not.toHaveBeenCalled();
  });
});

describe("createSegment validation", () => {
  it("rejects a blank name and never inserts", async () => {
    await expect(createSegment(OWNER, { name: "   " })).rejects.toMatchObject({
      name: "OpError",
      status: 400,
      message: "Segment name is required",
    });
    expect(segmentCreate).not.toHaveBeenCalled();
  });
});
