// POST /api/cleanup/imported used to honor a caller-supplied `sources` list.
// In a Clerk org session getAuthenticatedUser() is the workspace account, so
// `{ sources: ["agent", "radar", "shared"] }` would deleteMany the shared CRM.
// The endpoint must only ever delete synthoz-webhook junk.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const deleteContactMany = vi.fn();
const deleteEntityMany = vi.fn();
const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      deleteMany: (...args: unknown[]) => deleteContactMany(...(args as [never])),
    },
    entity: {
      deleteMany: (...args: unknown[]) => deleteEntityMany(...(args as [never])),
    },
    $transaction: (...args: unknown[]) => transaction(...(args as [never])),
  },
}));

const AUTH_USER = { id: "workspace-1" };
const getAuthenticatedUserMock = vi.fn(async () => AUTH_USER);
vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...(args as [])),
}));

import { POST } from "@/app/api/cleanup/imported/route";

function req(body: unknown) {
  return new NextRequest(new URL("https://scalar.test/api/cleanup/imported"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cleanup/imported - source allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserMock.mockResolvedValue(AUTH_USER);
    deleteContactMany.mockResolvedValue({ count: 2 });
    deleteEntityMany.mockResolvedValue({ count: 1 });
  });

  it("deletes only synthoz-webhook records when the UI sends {}", async () => {
    const res = await POST(req({}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sources).toEqual(["synthoz-webhook"]);
    expect(deleteContactMany).toHaveBeenCalledWith({
      where: { userId: "workspace-1", source: { in: ["synthoz-webhook"] } },
    });
    expect(deleteEntityMany).toHaveBeenCalledWith({
      where: { userId: "workspace-1", source: { in: ["synthoz-webhook"] } },
    });
  });

  it("refuses a custom source list that would wipe discovered CRM records", async () => {
    const res = await POST(
      req({
        sources: ["agent", "agent:exa", "radar", "shared", "welcome:exa", "manual"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/synthoz-webhook/);
    expect(transaction).not.toHaveBeenCalled();
    expect(deleteContactMany).not.toHaveBeenCalled();
    expect(deleteEntityMany).not.toHaveBeenCalled();
  });

  it("refuses a mixed list that includes one disallowed source", async () => {
    const res = await POST(req({ sources: ["synthoz-webhook", "agent"] }));
    expect(res.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("still accepts an explicit synthoz-webhook list", async () => {
    const res = await POST(req({ sources: ["synthoz-webhook"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.deletedContacts).toBe(2);
    expect(body.deletedEntities).toBe(1);
    expect(deleteContactMany).toHaveBeenCalledTimes(1);
  });
});
