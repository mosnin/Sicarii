// A research schedule can pin a contact or company and later overwrite its
// notes. The create path must refuse a target the caller does not own, and
// delete must 404 a foreign schedule, or one tenant can point a job at
// another tenant's CRM (or erase their jobs).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const AUTH_USER = { id: "user-1" };
const getAuthenticatedUser = vi.fn(async () => AUTH_USER);
vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args),
}));

const checkRateLimit = vi.fn(async () => ({ success: true, remaining: 19, resetAt: 0 }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

const contactFindFirst = vi.fn();
const entityFindFirst = vi.fn();
const scheduleCreate = vi.fn();
const scheduleFindUnique = vi.fn();
const scheduleDelete = vi.fn();
const scheduleFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findFirst: (...args: unknown[]) => contactFindFirst(...args) },
    entity: { findFirst: (...args: unknown[]) => entityFindFirst(...args) },
    researchSchedule: {
      create: (...args: unknown[]) => scheduleCreate(...args),
      findUnique: (...args: unknown[]) => scheduleFindUnique(...args),
      delete: (...args: unknown[]) => scheduleDelete(...args),
      findMany: (...args: unknown[]) => scheduleFindMany(...args),
    },
  },
}));

import { POST, DELETE } from "@/app/api/research-schedules/route";

function post(body: unknown) {
  return new NextRequest(new URL("https://scalar.test/api/research-schedules"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del(id?: string) {
  const url = new URL("https://scalar.test/api/research-schedules");
  if (id) url.searchParams.set("id", id);
  return new NextRequest(url, { method: "DELETE" });
}

describe("POST /api/research-schedules target ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue(AUTH_USER);
    checkRateLimit.mockResolvedValue({ success: true, remaining: 19, resetAt: 0 });
    contactFindFirst.mockResolvedValue(null);
    entityFindFirst.mockResolvedValue(null);
    scheduleCreate.mockResolvedValue({ id: "sched-1" });
  });

  it("rejects a stolen contact id and never inserts", async () => {
    contactFindFirst.mockResolvedValue(null);
    const res = await POST(
      post({
        name: "Watch Acme",
        query: "Acme funding",
        targetType: "contact",
        targetId: "contact-foreign",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Invalid target" });
    expect(contactFindFirst).toHaveBeenCalledWith({
      where: { id: "contact-foreign", userId: "user-1" },
      select: { id: true },
    });
    expect(scheduleCreate).not.toHaveBeenCalled();
  });

  it("rejects a stolen entity id and never inserts", async () => {
    entityFindFirst.mockResolvedValue(null);
    const res = await POST(
      post({
        name: "Watch Acme",
        query: "Acme funding",
        targetType: "entity",
        targetId: "entity-foreign",
      }),
    );
    expect(res.status).toBe(400);
    expect(scheduleCreate).not.toHaveBeenCalled();
    expect(entityFindFirst).toHaveBeenCalledWith({
      where: { id: "entity-foreign", userId: "user-1" },
      select: { id: true },
    });
  });

  it("inserts when the targeted contact belongs to the caller", async () => {
    contactFindFirst.mockResolvedValue({ id: "contact-own" });
    const res = await POST(
      post({
        name: "Watch Acme",
        query: "Acme funding",
        targetType: "contact",
        targetId: "contact-own",
      }),
    );
    expect(res.status).toBe(201);
    expect(scheduleCreate).toHaveBeenCalledTimes(1);
    expect(scheduleCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      userId: "user-1",
      targetType: "contact",
      targetId: "contact-own",
    });
  });

  it("rejects a missing name or query before any lookup", async () => {
    const res = await POST(post({ name: "Watch Acme" }));
    expect(res.status).toBe(400);
    expect(contactFindFirst).not.toHaveBeenCalled();
    expect(scheduleCreate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/research-schedules isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("404s a schedule owned by someone else and never deletes", async () => {
    scheduleFindUnique.mockResolvedValue({ id: "sched-2", userId: "user-other" });
    const res = await DELETE(del("sched-2"));
    expect(res.status).toBe(404);
    expect(scheduleDelete).not.toHaveBeenCalled();
  });

  it("404s a missing schedule", async () => {
    scheduleFindUnique.mockResolvedValue(null);
    const res = await DELETE(del("sched-missing"));
    expect(res.status).toBe(404);
    expect(scheduleDelete).not.toHaveBeenCalled();
  });

  it("deletes the caller's own schedule", async () => {
    scheduleFindUnique.mockResolvedValue({ id: "sched-1", userId: "user-1" });
    scheduleDelete.mockResolvedValue({ id: "sched-1" });
    const res = await DELETE(del("sched-1"));
    expect(res.status).toBe(200);
    expect(scheduleDelete).toHaveBeenCalledWith({ where: { id: "sched-1" } });
  });

  it("returns 401 when the session is missing", async () => {
    getAuthenticatedUser.mockRejectedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await DELETE(del("sched-1"));
    expect(res.status).toBe(401);
    expect(scheduleDelete).not.toHaveBeenCalled();
  });
});
