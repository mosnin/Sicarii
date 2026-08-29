// Intent-monitor create/delete is a paid, tenant-scoped write. A missing
// query, an over-long payload, a free-plan cap miss, or deleting another
// user's monitor must fail closed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const count = vi.fn();
const create = vi.fn();
const findUnique = vi.fn();
const deleteMonitor = vi.fn();
const createExaMonitor = vi.fn();
const deleteExaMonitor = vi.fn();

vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "user-A", plan: "starter" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    intentMonitor: {
      count: (...args: unknown[]) => count(...args),
      create: (...args: unknown[]) => create(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      delete: (...args: unknown[]) => deleteMonitor(...args),
    },
  },
}));

vi.mock("@/lib/exa", () => ({
  isExaConfigured: () => true,
  exaWebhookToken: () => "tok",
  createExaMonitor: (...args: unknown[]) => createExaMonitor(...args),
  deleteExaMonitor: (...args: unknown[]) => deleteExaMonitor(...args),
}));

import { POST, DELETE } from "@/app/api/intent-monitors/route";
import { getAuthenticatedUser } from "@/lib/auth-utils";

function postReq(body: unknown) {
  return new NextRequest("https://scalar.test/api/intent-monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(id?: string) {
  const url = new URL("https://scalar.test/api/intent-monitors");
  if (id) url.searchParams.set("id", id);
  return new NextRequest(url, { method: "DELETE" });
}

describe("POST /api/intent-monitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "user-A", plan: "starter" } as never);
    count.mockResolvedValue(0);
    create.mockResolvedValue({ id: "im_1", query: "q" });
    createExaMonitor.mockResolvedValue({ id: "exa_1" });
  });

  it("requires a query", async () => {
    const res = await POST(postReq({ name: "no query" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an oversized query or name", async () => {
    const longQuery = "x".repeat(2001);
    expect((await POST(postReq({ query: longQuery }))).status).toBe(400);
    expect((await POST(postReq({ query: "ok", name: "n".repeat(201) }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 402 when the plan monitor cap is already reached", async () => {
    // starter allows 1
    count.mockResolvedValue(1);
    const res = await POST(postReq({ query: "dentists miami" }));
    expect(res.status).toBe(402);
    expect(create).not.toHaveBeenCalled();
    expect(createExaMonitor).not.toHaveBeenCalled();
  });

  it("still persists locally when Exa registration fails", async () => {
    createExaMonitor.mockRejectedValue(new Error("exa down"));
    const res = await POST(postReq({ query: "dentists miami", autoAdd: false }));
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-A",
          query: "dentists miami",
          autoAdd: false,
          exaMonitorId: undefined,
        }),
      }),
    );
  });
});

describe("DELETE /api/intent-monitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "user-A", plan: "pro" } as never);
    deleteMonitor.mockResolvedValue({});
    deleteExaMonitor.mockResolvedValue(undefined);
  });

  it("requires an id", async () => {
    const res = await DELETE(deleteReq());
    expect(res.status).toBe(400);
  });

  it("does not delete another user's monitor", async () => {
    findUnique.mockResolvedValue({ id: "im_x", userId: "user-B", exaMonitorId: "exa_x" });
    const res = await DELETE(deleteReq("im_x"));
    expect(res.status).toBe(404);
    expect(deleteMonitor).not.toHaveBeenCalled();
    expect(deleteExaMonitor).not.toHaveBeenCalled();
  });

  it("deletes the caller's monitor and best-effort-removes the Exa registration", async () => {
    findUnique.mockResolvedValue({ id: "im_1", userId: "user-A", exaMonitorId: "exa_1" });
    const res = await DELETE(deleteReq("im_1"));
    expect(res.status).toBe(200);
    expect(deleteExaMonitor).toHaveBeenCalledWith("exa_1");
    expect(deleteMonitor).toHaveBeenCalledWith({ where: { id: "im_1" } });
  });
});
