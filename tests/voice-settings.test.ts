// Voice-native CRM: application-level secret uniqueness. Since
// voiceInboundSecret is NOT a DB-level unique constraint (see the schema
// comment on that column - a UNIQUE INDEX on this Supabase project's `users`
// table fails `prisma db push`), uniqueness has to be enforced when the
// secret is minted instead. These tests prove that enforcement actually
// runs (checks for a collision and regenerates) rather than just being a
// comment, and that enabling voice still requires a connected AgentPhone key.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findFirst = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => findFirst(...(args as [never])),
      update: (...args: unknown[]) => update(...(args as [never])),
    },
  },
}));

const AUTH_USER = {
  id: "user-1",
  agentPhoneApiKey: "sk_live_x" as string | null,
  voiceInboundSecret: null as string | null,
};
const getAuthenticatedUserMock = vi.fn(async () => AUTH_USER);
vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...(args as [])),
}));

const secretQueue: string[] = [];
const generateVoiceInboundSecretMock = vi.fn(() => secretQueue.shift() ?? "z".repeat(64));
vi.mock("@/lib/agentphone", () => ({
  generateVoiceInboundSecret: (...args: unknown[]) => generateVoiceInboundSecretMock(...(args as [])),
}));

import { PATCH } from "@/app/api/settings/voice/route";

function req(body: unknown) {
  return new NextRequest(new URL("https://scalar.test/api/settings/voice"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/settings/voice - application-level secret uniqueness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secretQueue.length = 0;
    getAuthenticatedUserMock.mockResolvedValue(AUTH_USER);
  });

  it("regenerates the secret on a collision instead of ever saving a duplicate", async () => {
    const collidingSecret = "a".repeat(64);
    const uniqueSecret = "b".repeat(64);
    secretQueue.push(collidingSecret, uniqueSecret);
    findFirst.mockResolvedValueOnce({ id: "some-other-user" }); // first candidate collides
    findFirst.mockResolvedValueOnce(null); // second candidate is clear
    update.mockResolvedValue({ voiceEnabled: true, agentPhoneApiKey: "sk_live_x", voiceInboundSecret: uniqueSecret });

    const res = await PATCH(req({ enabled: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(generateVoiceInboundSecretMock).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(body.secret).toBe(uniqueSecret);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ voiceInboundSecret: uniqueSecret }) }),
    );
    // The colliding candidate must never reach the database.
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ voiceInboundSecret: collidingSecret }) }),
    );
  });

  it("accepts the first candidate immediately when there is no collision", async () => {
    const uniqueSecret = "c".repeat(64);
    secretQueue.push(uniqueSecret);
    findFirst.mockResolvedValueOnce(null);
    update.mockResolvedValue({ voiceEnabled: true, agentPhoneApiKey: "sk_live_x", voiceInboundSecret: uniqueSecret });

    const res = await PATCH(req({ enabled: true }));

    expect(res.status).toBe(200);
    expect(generateVoiceInboundSecretMock).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("refuses to enable voice without a connected AgentPhone key (no secret minted, no DB write)", async () => {
    getAuthenticatedUserMock.mockResolvedValueOnce({ id: "user-2", agentPhoneApiKey: null, voiceInboundSecret: null });

    const res = await PATCH(req({ enabled: true }));

    expect(res.status).toBe(400);
    expect(generateVoiceInboundSecretMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rotate mints a fresh unique secret the same way as first enabling", async () => {
    const uniqueSecret = "d".repeat(64);
    secretQueue.push(uniqueSecret);
    findFirst.mockResolvedValueOnce(null);
    update.mockResolvedValue({ voiceEnabled: true, agentPhoneApiKey: "sk_live_x", voiceInboundSecret: uniqueSecret });

    const res = await PATCH(req({ rotate: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.secret).toBe(uniqueSecret);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { voiceInboundSecret: uniqueSecret } }),
    );
  });
});
