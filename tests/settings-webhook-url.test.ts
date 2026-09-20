// PATCH /api/settings accepts a taskWebhookUrl that the outbound sender
// later fetches. HTTP is rejected at save time so a stored URL can never
// silently fail (or be pointed at an internal http target). Empty string
// clears the field.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const AUTH_USER = { id: "user-1" };
const getAuthenticatedUser = vi.fn(async () => AUTH_USER);
vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args),
}));

const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: (...args: unknown[]) => userUpdate(...args) },
    intentMonitor: { updateMany: vi.fn() },
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

describe("PATCH /api/settings taskWebhookUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue(AUTH_USER);
    userUpdate.mockResolvedValue({
      productContext: "",
      agentMailApiKey: null,
      agentPhoneApiKey: null,
      taskWebhookUrl: "https://hooks.example.com/scalar",
      autoRadar: true,
    });
  });

  it("rejects an http:// webhook URL and never writes", async () => {
    const res = await PATCH(req({ taskWebhookUrl: "http://hooks.example.com/scalar" }));
    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("rejects a non-URL string", async () => {
    const res = await PATCH(req({ taskWebhookUrl: "not-a-url" }));
    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("saves an https:// webhook URL", async () => {
    const res = await PATCH(req({ taskWebhookUrl: "https://hooks.example.com/scalar" }));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { taskWebhookUrl: "https://hooks.example.com/scalar" },
    });
  });

  it("clears the webhook URL when the client sends an empty string", async () => {
    userUpdate.mockResolvedValue({
      productContext: "",
      agentMailApiKey: null,
      agentPhoneApiKey: null,
      taskWebhookUrl: null,
      autoRadar: true,
    });
    const res = await PATCH(req({ taskWebhookUrl: "" }));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { taskWebhookUrl: null },
    });
  });

  it("returns 401 when the session is missing", async () => {
    getAuthenticatedUser.mockRejectedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await PATCH(req({ taskWebhookUrl: "https://hooks.example.com/scalar" }));
    expect(res.status).toBe(401);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
