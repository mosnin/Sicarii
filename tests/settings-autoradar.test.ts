// The Settings autoRadar switch is a real off switch for the ICP radar that
// was seeded for this account. The pause/resume write must be scoped to the
// caller's own auto-seeded monitors — a missing userId (or dropping
// autoSeeded) would pause every tenant's seeded radar, or a monitor they
// created by hand.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const AUTH_USER = { id: "user-1" };
const getAuthenticatedUser = vi.fn(async () => AUTH_USER);
vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args),
}));

const userUpdate = vi.fn();
const monitorUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: (...args: unknown[]) => userUpdate(...args) },
    intentMonitor: { updateMany: (...args: unknown[]) => monitorUpdateMany(...args) },
  },
}));

import { PATCH } from "@/app/api/settings/route";

function req(body: unknown) {
  return new NextRequest(new URL("https://scalar.test/api/settings"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/settings autoRadar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue(AUTH_USER);
    userUpdate.mockResolvedValue({
      productContext: "",
      agentMailApiKey: null,
      agentPhoneApiKey: null,
      taskWebhookUrl: null,
      autoRadar: false,
    });
    monitorUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("pauses only this user's auto-seeded monitors", async () => {
    const res = await PATCH(req({ autoRadar: false }));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { autoRadar: false },
    });
    expect(monitorUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", autoSeeded: true },
      data: { active: false },
    });
  });

  it("resumes only this user's auto-seeded monitors", async () => {
    userUpdate.mockResolvedValue({
      productContext: "",
      agentMailApiKey: null,
      agentPhoneApiKey: null,
      taskWebhookUrl: null,
      autoRadar: true,
    });
    const res = await PATCH(req({ autoRadar: true }));
    expect(res.status).toBe(200);
    expect(monitorUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", autoSeeded: true },
      data: { active: true },
    });
  });

  it("does not touch monitors when autoRadar is omitted", async () => {
    userUpdate.mockResolvedValue({
      productContext: "We sell to clinics",
      agentMailApiKey: null,
      agentPhoneApiKey: null,
      taskWebhookUrl: null,
      autoRadar: true,
    });
    const res = await PATCH(req({ productContext: "We sell to clinics" }));
    expect(res.status).toBe(200);
    expect(monitorUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 401 when the session is missing", async () => {
    getAuthenticatedUser.mockRejectedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await PATCH(req({ autoRadar: false }));
    expect(res.status).toBe(401);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(monitorUpdateMany).not.toHaveBeenCalled();
  });
});
