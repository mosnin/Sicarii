// Smart segments may only target prospects that are not yet being worked:
// status NEW or ENRICHED, and not already in any pipeline. Requiring
// ENRICHED-only would empty every fresh segment; including CONTACTED/WON
// would re-target people already reached. Ranking is cosine similarity of
// the goal embedding vs each candidate — a swap here emails the wrong list.
//
// build-segment-credits.test.ts already pins metering. This file pins the
// eligibility fence and the rank order.

import { describe, it, expect, vi, beforeEach } from "vitest";

const pipelineEntryFindMany = vi.fn();
const contactFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineEntry: {
      findMany: (...a: unknown[]) => pipelineEntryFindMany(...a),
    },
    contact: {
      findMany: (...a: unknown[]) => contactFindMany(...a),
    },
  },
}));

const embed = vi.fn();
const embedMany = vi.fn();
vi.mock("ai", () => ({
  embed: (...a: unknown[]) => embed(...a),
  embedMany: (...a: unknown[]) => embedMany(...a),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: { embedding: (model: string) => model },
}));

import { buildSegmentMatches } from "@/lib/segment-build";

const USER = "user-1";

function candidate(id: string, name: string) {
  return {
    id,
    name,
    title: null,
    company: null,
    location: null,
    notes: null,
    entity: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pipelineEntryFindMany.mockResolvedValue([]);
  contactFindMany.mockResolvedValue([]);
  embed.mockResolvedValue({ embedding: [1, 0] });
  embedMany.mockResolvedValue({ embeddings: [] });
});

describe("buildSegmentMatches eligibility", () => {
  it("returns empty and never embeds when there are no eligible prospects", async () => {
    const result = await buildSegmentMatches(USER, "enterprise CIOs", 10);
    expect(result).toEqual({ matches: [], eligibleCount: 0 });
    expect(embed).not.toHaveBeenCalled();
    expect(embedMany).not.toHaveBeenCalled();
  });

  it("queries only NEW/ENRICHED contacts for this user", async () => {
    await buildSegmentMatches(USER, "goal", 5);
    expect(contactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER,
          status: { in: ["NEW", "ENRICHED"] },
        }),
      }),
    );
  });

  it("excludes contacts already in any pipeline", async () => {
    pipelineEntryFindMany.mockResolvedValue([{ contactId: "c-worked" }, { contactId: "c-also" }]);
    await buildSegmentMatches(USER, "goal", 5);
    expect(pipelineEntryFindMany).toHaveBeenCalledWith({
      where: { userId: USER },
      select: { contactId: true },
    });
    expect(contactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: ["c-worked", "c-also"] },
        }),
      }),
    );
  });

  it("does not apply an id filter when the pipeline is empty", async () => {
    pipelineEntryFindMany.mockResolvedValue([]);
    await buildSegmentMatches(USER, "goal", 5);
    const where = contactFindMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.id).toBeUndefined();
  });
});

describe("buildSegmentMatches ranking", () => {
  it("ranks by cosine similarity and respects quantity", async () => {
    contactFindMany.mockResolvedValue([
      candidate("far", "Far Co"),
      candidate("near", "Near Co"),
      candidate("mid", "Mid Co"),
    ]);
    embed.mockResolvedValue({ embedding: [1, 0] });
    embedMany.mockResolvedValue({
      embeddings: [
        [0, 1], // far — orthogonal
        [1, 0], // near — identical
        [0.6, 0.8], // mid
      ],
    });

    const { matches, eligibleCount } = await buildSegmentMatches(USER, "goal", 2);
    expect(eligibleCount).toBe(3);
    expect(matches.map((m) => m.contactId)).toEqual(["near", "mid"]);
    expect(matches[0].score).toBeCloseTo(1);
    expect(matches[1].score).toBeLessThan(matches[0].score);
  });

  it("never returns more matches than eligible candidates (quantity is a cap)", async () => {
    contactFindMany.mockResolvedValue([candidate("c1", "One")]);
    embed.mockResolvedValue({ embedding: [1, 0] });
    embedMany.mockResolvedValue({ embeddings: [[1, 0]] });

    const { matches } = await buildSegmentMatches(USER, "goal", 50);
    expect(matches).toHaveLength(1);
    expect(matches[0].contactId).toBe("c1");
  });
});
