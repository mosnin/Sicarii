// Creation circuit breaker: DB-backed cap so a webhook or loop cannot flood
// one account's CRM. Counts real entity+contact rows in the window.

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
  it("is ok while the combined recent count is under the limit", async () => {
    entityCount.mockResolvedValue(40);
    contactCount.mockResolvedValue(50);

    const result = await checkCreationBudget("u1");
    expect(result).toMatchObject({ ok: true, recent: 90, limit: 1000, windowMinutes: 10 });
    expect(entityCount).toHaveBeenCalledWith({
      where: { userId: "u1", createdAt: { gte: expect.any(Date) } },
    });
    expect(contactCount).toHaveBeenCalledWith({
      where: { userId: "u1", createdAt: { gte: expect.any(Date) } },
    });
  });

  it("cools down at the limit (strictly less-than)", async () => {
    entityCount.mockResolvedValue(400);
    contactCount.mockResolvedValue(600);

    await expect(checkCreationBudget("u1")).resolves.toMatchObject({
      ok: false,
      recent: 1000,
      limit: 1000,
    });
  });

  it("honors an explicit tighter budget", async () => {
    entityCount.mockResolvedValue(3);
    contactCount.mockResolvedValue(2);

    await expect(checkCreationBudget("u1", { limit: 5, windowMinutes: 2 })).resolves.toMatchObject({
      ok: false,
      recent: 5,
      limit: 5,
      windowMinutes: 2,
    });
  });
});
