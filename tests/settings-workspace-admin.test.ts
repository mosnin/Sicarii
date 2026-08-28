// Workspace members must not write or read team integration secrets.
// getAuthenticatedUser() scopes to the workspace row, so an unguarded
// PATCH /api/settings lets any org:member overwrite AgentMail/AgentPhone
// keys and the task webhook — the same class of gate billing checkout
// and API-key minting already enforce.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => update(...(args as [never])),
      findFirst: vi.fn(),
    },
    intentMonitor: {
      updateMany: vi.fn(),
    },
  },
}));

const WORKSPACE = {
  id: "ws-1",
  agentMailApiKey: "am_live_existing",
  agentPhoneApiKey: "ap_live_existing",
  taskWebhookUrl: "https://hooks.team.example/tasks",
  productContext: "We sell to clinics",
  autoRadar: true,
  voiceEnabled: true,
  voiceInboundSecret: "voice-secret-should-not-leak",
};

const getAuthContextMock = vi.fn();
vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: (...args: unknown[]) => getAuthContextMock(...(args as [])),
  getAuthenticatedUser: async () => {
    const ctx = await getAuthContextMock();
    return ctx.account;
  },
}));

vi.mock("@/lib/agentphone", () => ({
  generateVoiceInboundSecret: () => "new-secret",
}));

import { PATCH as patchSettings } from "@/app/api/settings/route";
import { GET as getVoice, PATCH as patchVoice } from "@/app/api/settings/voice/route";

function settingsReq(body: unknown) {
  return new NextRequest(new URL("https://scalar.test/api/settings"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function voiceReq(body: unknown) {
  return new NextRequest(new URL("https://scalar.test/api/settings/voice"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function asMember() {
  getAuthContextMock.mockResolvedValue({
    account: WORKSPACE,
    actor: { id: "member-1" },
    workspaceRole: "member",
  });
}

function asAdmin() {
  getAuthContextMock.mockResolvedValue({
    account: WORKSPACE,
    actor: { id: "admin-1" },
    workspaceRole: "admin",
  });
}

function asPersonal() {
  getAuthContextMock.mockResolvedValue({
    account: { ...WORKSPACE, id: "user-1" },
    actor: { id: "user-1" },
    workspaceRole: null,
  });
}

describe("workspace members cannot hijack integration secrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue(WORKSPACE);
  });

  it("rejects a member overwriting the workspace AgentMail key", async () => {
    asMember();
    const res = await patchSettings(settingsReq({ agentMailApiKey: "am_attacker" }));
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a member overwriting the workspace AgentPhone key", async () => {
    asMember();
    const res = await patchSettings(settingsReq({ agentPhoneApiKey: "ap_attacker" }));
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a member redirecting the task webhook", async () => {
    asMember();
    const res = await patchSettings(
      settingsReq({ taskWebhookUrl: "https://attacker.example/hook" }),
    );
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("still lets a member update productContext", async () => {
    asMember();
    update.mockResolvedValue({ ...WORKSPACE, productContext: "New ICP" });
    const res = await patchSettings(settingsReq({ productContext: "New ICP" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it("lets an admin rotate integration keys", async () => {
    asAdmin();
    update.mockResolvedValue({ ...WORKSPACE, agentMailApiKey: "am_new" });
    const res = await patchSettings(settingsReq({ agentMailApiKey: "am_new" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it("lets a personal account save its own keys", async () => {
    asPersonal();
    update.mockResolvedValue({ ...WORKSPACE, id: "user-1", agentMailApiKey: "am_mine" });
    const res = await patchSettings(settingsReq({ agentMailApiKey: "am_mine" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it("rejects a member rotating the voice inbound secret", async () => {
    asMember();
    const res = await patchVoice(voiceReq({ rotate: true }));
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not leak the voice inbound secret to a member", async () => {
    asMember();
    const res = await getVoice();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.secret).toBeNull();
    expect(body.enabled).toBe(true);
  });

  it("returns the voice secret to a workspace admin", async () => {
    asAdmin();
    const res = await getVoice();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.secret).toBe("voice-secret-should-not-leak");
  });
});
