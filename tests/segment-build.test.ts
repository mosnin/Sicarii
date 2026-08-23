// Smart-segment matching: only untouched prospects are eligible, pipeline
// rows are excluded, and ranking is cosine similarity. A regression here
// would put already-worked or contacted leads back into outreach.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { embed, embedMany, pipelineFindMany, contactFindMany } = vi.hoisted(() => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
  pipelineFindMany: vi.fn(),
  contactFindMany: vi.fn(),
}));

vi.mock("ai", () => ({ embed, embedMany }));
vi.mock("@ai-sdk/openai", () => ({
  openai: { embedding: vi.fn(() => "mock-embed-model") },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineEntry: { findMany: pipelineFindMany },
    contact: { findMany: contactFindMany },
  },
}));

import { buildSegmentMatches } from "@/lib/segment-build";

const USER = "user-1";

function contact(id: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    name: extras.name ?? id,
    title: extras.title ?? null,
    company: extras.company ?? null,
    location: extras.location ?? null,
    notes: extras.notes ?? null,
    entity: extras.entity ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pipelineFindMany.mockResolvedValue([]);
  contactFindMany.mockResolvedValue([]);
  embed.mockResolvedValue({ embedding: [1, 0] });
  embedMany.mockResolvedValue({ embeddings: [] });
});

describe("buildSegmentMatches eligibility", () => {
  it("returns empty without embedding when nobody is eligible", async () => {
    await expect(buildSegmentMatches(USER, "fintech CROs", 10)).resolves.toEqual({
      matches: [],
      eligibleCount: 0,
    });
    expect(embed).not.toHaveBeenCalled();
    expect(embedMany).not.toHaveBeenCalled();
  });

  it("only considers NEW/ENRICHED contacts and excludes anyone already in a pipeline", async () => {
    pipelineFindMany.mockResolvedValue([{ contactId: "c-pipe" }, { contactId: "c-other" }]);
    contactFindMany.mockResolvedValue([contact("c-new")]);
    embedMany.mockResolvedValue({ embeddings: [[1, 0]] });

    await buildSegmentMatches(USER, "goal", 5, 50);

    expect(pipelineFindMany).toHaveBeenCalledWith({
      where: { userId: USER },
      select: { contactId: true },
    });
    expect(contactFindMany).toHaveBeenCalledWith({
      where: {
        userId: USER,
        status: { in: ["NEW", "ENRICHED"] },
        id: { notIn: ["c-pipe", "c-other"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { entity: { select: { name: true, industry: true, description: true } } },
    });
  });

  it("does not add an id filter when the pipeline is empty", async () => {
    contactFindMany.mockResolvedValue([contact("c1")]);
    embedMany.mockResolvedValue({ embeddings: [[1, 0]] });

    await buildSegmentMatches(USER, "goal", 3);

    const where = contactFindMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.status).toEqual({ in: ["NEW", "ENRICHED"] });
    expect(where).not.toHaveProperty("id");
  });
});

describe("buildSegmentMatches ranking", () => {
  it("ranks by cosine similarity and caps quantity", async () => {
    contactFindMany.mockResolvedValue([
      contact("aligned"),
      contact("orthogonal"),
      contact("opposite"),
    ]);
    embed.mockResolvedValue({ embedding: [1, 0] });
    embedMany.mockResolvedValue({
      embeddings: [
        [1, 0],
        [0, 1],
        [-1, 0],
      ],
    });

    const { matches, eligibleCount } = await buildSegmentMatches(USER, "goal", 2);
    expect(eligibleCount).toBe(3);
    expect(matches).toEqual([
      { contactId: "aligned", score: 1 },
      { contactId: "orthogonal", score: 0 },
    ]);
    expect(matches.map((m) => m.contactId)).not.toContain("opposite");
  });

  it("treats a zero vector as score 0 and still returns at least one match", async () => {
    contactFindMany.mockResolvedValue([contact("zero")]);
    embed.mockResolvedValue({ embedding: [0, 0] });
    embedMany.mockResolvedValue({ embeddings: [[1, 0]] });

    const { matches } = await buildSegmentMatches(USER, "goal", 0);
    expect(matches).toEqual([{ contactId: "zero", score: 0 }]);
  });

  it("slices the goal before embedding so a huge prompt cannot blow the call", async () => {
    contactFindMany.mockResolvedValue([contact("c1")]);
    embedMany.mockResolvedValue({ embeddings: [[1, 0]] });
    const goal = "x".repeat(5000);

    await buildSegmentMatches(USER, goal, 1);
    expect(embed.mock.calls[0][0].value).toHaveLength(2000);
  });
});
