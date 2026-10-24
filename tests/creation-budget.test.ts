// Creation circuit breaker: counts real entity+contact rows in a window so a
// runaway ingest cannot flood the CRM. ok is strictly recent < limit, and the
// count is scoped to the calling user.

import { describe, it, expect, vi, beforeEach } from "vitest";

const entityCount = vi.fn();
const contactCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: { count: (...args: unknown[]) => entityCount(...args) },
    contact: { count: (...args: unknown[]) => contactCount(...args) },
  },
}));

import { checkCreationBudget } from "@/lib/creation-guard";

beforeEach(() => {
  entityCount.mockReset();
  contactCount.mockReset();
});

describe("checkCreationBudget", () => {
  it("is ok when the combined count is under the default limit of 1000", async () => {
    entityCount.mockResolvedValue(400);
    contactCount.mockResolvedValue(599);
    await expect(checkCreationBudget("u1")).resolves.toEqual({
      ok: true,
      recent: 999,
      limit: 1000,
      windowMinutes: 10,
    });
    expect(entityCount.mock.calls[0][0].where.userId).toBe("u1");
    expect(contactCount.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("is not ok at or over the limit", async () => {
    entityCount.mockResolvedValue(500);
    contactCount.mockResolvedValue(500);
    await expect(checkCreationBudget("u1")).resolves.toMatchObject({
      ok: false,
      recent: 1000,
      limit: 1000,
    });

    entityCount.mockResolvedValue(800);
    contactCount.mockResolvedValue(400);
    await expect(checkCreationBudget("u1")).resolves.toMatchObject({
      ok: false,
      recent: 1200,
    });
  });

  it("honors a tighter caller-supplied window and limit", async () => {
    entityCount.mockResolvedValue(3);
    contactCount.mockResolvedValue(2);
    const result = await checkCreationBudget("u2", { windowMinutes: 2, limit: 5 });
    expect(result).toEqual({ ok: false, recent: 5, limit: 5, windowMinutes: 2 });

    const since: Date = entityCount.mock.calls[0][0].where.createdAt.gte;
    const ageMs = Date.now() - since.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(2 * 60_000 - 50);
    expect(ageMs).toBeLessThan(2 * 60_000 + 200);
  });
});
