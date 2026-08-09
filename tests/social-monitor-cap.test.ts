// The scheduled-monitor cap: intent and social monitors share one per-plan
// allotment, so neither type can be used to slip past the other's limit.
import { describe, it, expect, vi, beforeEach } from "vitest";

const counts = { social: 0, intent: 0 };
let plan = "free";
const created: unknown[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ plan })) },
    socialMonitor: {
      count: vi.fn(async () => counts.social),
      create: vi.fn(async ({ data }: { data: unknown }) => {
        created.push(data);
        return { id: "m1", ...(data as object) };
      }),
    },
    intentMonitor: { count: vi.fn(async () => counts.intent) },
  },
}));

// planFor is the real thing; PLANS.free.monitors = 0, starter = 1.
import { createSocialMonitor } from "@/lib/social-opportunities";

beforeEach(() => {
  counts.social = 0;
  counts.intent = 0;
  plan = "free";
  created.length = 0;
});

const base = { name: "Watch", platform: "REDDIT" as const, query: "hiring an SDR" };

describe("scheduled monitor cap (intent + social combined)", () => {
  it("blocks a free-plan user, who gets zero monitors", async () => {
    plan = "free";
    await expect(createSocialMonitor("u1", base)).rejects.toMatchObject({ status: 402 });
    expect(created).toHaveLength(0);
  });

  it("counts existing INTENT monitors against the social cap (the bypass)", async () => {
    // starter allows 1 monitor; the user already has an intent monitor, so a
    // social one must be refused rather than silently becoming their second.
    plan = "starter";
    counts.intent = 1;
    counts.social = 0;
    await expect(createSocialMonitor("u1", base)).rejects.toMatchObject({ status: 402 });
    expect(created).toHaveLength(0);
  });

  it("allows a social monitor when the combined count is under the cap", async () => {
    plan = "starter";
    counts.intent = 0;
    counts.social = 0;
    await expect(createSocialMonitor("u1", base)).resolves.toMatchObject({ id: "m1" });
    expect(created).toHaveLength(1);
  });
});
