// listDueFollowups is how agents decide who to chase next. A wrong where-clause
// (missing userId, wrong default status, or ignoring lastContactedAt) would
// either skip real follow-ups or leak another user's contacts. listActivities
// must refuse an orphan query (no contact/entity) so it cannot dump the
// caller's entire activity table.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindMany = vi.fn().mockResolvedValue([]);
const activityFindMany = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findMany: (...a: unknown[]) => contactFindMany(...a) },
    activity: { findMany: (...a: unknown[]) => activityFindMany(...a) },
  },
}));

import { listDueFollowups, listActivities } from "@/lib/crm-operations";

const USER = "user-1";

beforeEach(() => {
  contactFindMany.mockClear();
  activityFindMany.mockClear();
});

describe("listDueFollowups query contract", () => {
  it("scopes to the caller, defaults to CONTACTED, and uses a 7-day cutoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:00.000Z"));
    try {
      await listDueFollowups(USER, {});
      expect(contactFindMany).toHaveBeenCalledTimes(1);
      const arg = contactFindMany.mock.calls[0][0] as {
        where: {
          userId: string;
          status: string;
          OR: Array<Record<string, unknown>>;
        };
        take: number;
      };
      expect(arg.where.userId).toBe(USER);
      expect(arg.where.status).toBe("CONTACTED");
      expect(arg.where.OR).toEqual([
        { lastContactedAt: null },
        { lastContactedAt: { lt: new Date("2026-08-24T10:00:00.000Z") } },
      ]);
      expect(arg.take).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors an explicit status and staleDays and clamps the limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:00.000Z"));
    try {
      await listDueFollowups(USER, { status: "QUALIFIED", staleDays: 3, limit: 999 });
      const arg = contactFindMany.mock.calls[0][0] as {
        where: { status: string; OR: Array<{ lastContactedAt?: { lt: Date } }> };
        take: number;
      };
      expect(arg.where.status).toBe("QUALIFIED");
      expect(arg.where.OR[1]?.lastContactedAt?.lt).toEqual(new Date("2026-08-28T10:00:00.000Z"));
      expect(arg.take).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("listActivities", () => {
  it("rejects a call with neither contactId nor entityId (no table dump)", async () => {
    await expect(listActivities(USER, {})).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(activityFindMany).not.toHaveBeenCalled();
  });

  it("always includes userId in the where clause", async () => {
    await listActivities(USER, { contactId: "c1" });
    expect(activityFindMany.mock.calls[0][0].where).toMatchObject({
      userId: USER,
      contactId: "c1",
    });
  });
});
