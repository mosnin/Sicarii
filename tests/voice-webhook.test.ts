// The inbound AgentPhone webhook is the security-critical surface of the
// voice feature: it answers with real CRM data over a public, unauthenticated
// HTTP endpoint, so identity MUST be proven before any CRM op runs. These
// tests prove:
//   - no key / wrong key / a key for a user with voice not configured are all
//     refused, and NO CRM op (voiceIntent) is ever invoked in those cases;
//   - a valid key resolves to exactly the right user and never another one
//     (tenant isolation) - the caller-supplied JSON body is never trusted for
//     identity, even when it contains a plausible-looking userId;
//   - a malformed / unparseable payload degrades gracefully (never throws,
//     never a raw 500 with no body for a live caller to hear).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const USER_A = { id: "user-A", voiceEnabled: true, agentPhoneApiKey: "sk_live_a" };
const USER_B = { id: "user-B", voiceEnabled: true, agentPhoneApiKey: "sk_live_b" };
const USER_NO_VOICE = { id: "user-C", voiceEnabled: false, agentPhoneApiKey: "sk_live_c" };
const USER_NO_AGENTPHONE = { id: "user-D", voiceEnabled: true, agentPhoneApiKey: null };

const SECRET_A = "a".repeat(64);
const SECRET_B = "b".repeat(64);
const SECRET_NO_VOICE = "c".repeat(64);
const SECRET_NO_AGENTPHONE = "d".repeat(64);

const usersBySecret: Record<string, unknown> = {
  [SECRET_A]: USER_A,
  [SECRET_B]: USER_B,
  [SECRET_NO_VOICE]: USER_NO_VOICE,
  [SECRET_NO_AGENTPHONE]: USER_NO_AGENTPHONE,
};

const findUnique = vi.fn(async ({ where }: { where: { voiceInboundSecret: string } }) => {
  return usersBySecret[where.voiceInboundSecret] ?? null;
});
const activityCreate = vi.fn().mockResolvedValue({ id: "activity-1" });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => findUnique(...(args as [never])) },
    activity: { create: (...args: unknown[]) => activityCreate(...(args as [never])) },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 100, resetAt: Date.now() + 60_000 }),
}));

const voiceIntentMock = vi.fn(async (userId: string, text: string) => ({
  speech: `speech-for-${userId}:${text}`,
  intent: "unknown" as const,
}));
vi.mock("@/lib/voice-intent", () => ({
  voiceIntent: (...args: [string, string]) => voiceIntentMock(...args),
}));

import { POST } from "@/app/api/webhooks/agentphone/route";

function req(body: unknown, key?: string | null, rawBody?: string) {
  const url = new URL("https://scalar.test/api/webhooks/agentphone");
  if (key) url.searchParams.set("key", key);
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/webhooks/agentphone - caller authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockImplementation(async ({ where }: { where: { voiceInboundSecret: string } }) => {
      return usersBySecret[where.voiceInboundSecret] ?? null;
    });
  });

  it("refuses a request with no key at all (401, no CRM op called)", async () => {
    const res = await POST(req({ text: "who do I need to follow up with" }, null));
    expect(res.status).toBe(401);
    expect(voiceIntentMock).not.toHaveBeenCalled();
  });

  it("refuses a request with a key that matches no user (401, no CRM op called)", async () => {
    const res = await POST(req({ text: "who do I need to follow up with" }, "f".repeat(64)));
    expect(res.status).toBe(401);
    expect(voiceIntentMock).not.toHaveBeenCalled();
  });

  it("refuses a short/implausible key without even querying the database", async () => {
    const res = await POST(req({ text: "hello" }, "short"));
    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
    expect(voiceIntentMock).not.toHaveBeenCalled();
  });

  it("refuses a valid key belonging to a user who has voice disabled (501, no CRM op called)", async () => {
    const res = await POST(req({ text: "who do I need to follow up with" }, SECRET_NO_VOICE));
    expect(res.status).toBe(501);
    expect(voiceIntentMock).not.toHaveBeenCalled();
  });

  it("refuses a valid key belonging to a user with no connected AgentPhone (501, no CRM op called)", async () => {
    const res = await POST(req({ text: "who do I need to follow up with" }, SECRET_NO_AGENTPHONE));
    expect(res.status).toBe(501);
    expect(voiceIntentMock).not.toHaveBeenCalled();
  });

  it("a spoofed userId/accountId in the JSON body is never trusted for identity", async () => {
    // The body claims to be user-B's call, but the key belongs to user-A.
    // Identity must come ONLY from the key.
    const res = await POST(
      req({ text: "who do I need to follow up with", userId: "user-B", accountId: "user-B" }, SECRET_A),
    );
    expect(res.status).toBe(200);
    expect(voiceIntentMock).toHaveBeenCalledWith("user-A", expect.any(String));
    expect(voiceIntentMock).not.toHaveBeenCalledWith("user-B", expect.any(String));
  });
});

describe("POST /api/webhooks/agentphone - tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a valid key for user A only ever resolves and returns user A's data, never user B's", async () => {
    const resA = await POST(req({ text: "what's hot" }, SECRET_A));
    const bodyA = await resA.json();
    expect(resA.status).toBe(200);
    expect(bodyA.speech).toContain("user-A");
    expect(bodyA.speech).not.toContain("user-B");
    expect(voiceIntentMock).toHaveBeenLastCalledWith("user-A", expect.any(String));
  });

  it("a valid key for user B only ever resolves and returns user B's data, never user A's", async () => {
    const resB = await POST(req({ text: "what's hot" }, SECRET_B));
    const bodyB = await resB.json();
    expect(resB.status).toBe(200);
    expect(bodyB.speech).toContain("user-B");
    expect(bodyB.speech).not.toContain("user-A");
    expect(voiceIntentMock).toHaveBeenLastCalledWith("user-B", expect.any(String));
  });

  it("logs the inbound interaction as an Activity scoped to the resolved user, not any body-supplied id", async () => {
    await POST(req({ text: "what's hot", userId: "user-B" }, SECRET_A));
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-A", kind: "call", channel: "phone" }) }),
    );
  });
});

describe("POST /api/webhooks/agentphone - defensive parsing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("degrades gracefully on unparseable JSON (never throws, still responds with speech)", async () => {
    const res = await POST(req(undefined, SECRET_A, "{ this is not valid json"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.speech).toBe("string");
    // extractTranscript() found nothing usable, so voiceIntent gets an empty string.
    expect(voiceIntentMock).toHaveBeenCalledWith("user-A", "");
  });

  it("degrades gracefully when the body has none of the guessed transcript field names", async () => {
    const res = await POST(req({ some_unexpected_field: 123, nested: { also: "no match" } }, SECRET_A));
    expect(res.status).toBe(200);
    expect(voiceIntentMock).toHaveBeenCalledWith("user-A", "");
  });

  it("degrades gracefully when a candidate transcript field has the wrong type", async () => {
    const res = await POST(req({ text: 12345, transcript: { nested: true } }, SECRET_A));
    expect(res.status).toBe(200);
    expect(voiceIntentMock).toHaveBeenCalledWith("user-A", "");
  });

  it("still answers (does not throw) when logging the Activity fails", async () => {
    activityCreate.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req({ text: "who do I need to follow up with" }, SECRET_A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.speech).toBe("string");
  });

  it("picks up a transcript from any of the plausible field names", async () => {
    await POST(req({ transcript: "hello from transcript" }, SECRET_A));
    expect(voiceIntentMock).toHaveBeenLastCalledWith("user-A", "hello from transcript");

    await POST(req({ transcription: "hello from transcription" }, SECRET_A));
    expect(voiceIntentMock).toHaveBeenLastCalledWith("user-A", "hello from transcription");

    await POST(req({ data: { text: "hello from nested data.text" } }, SECRET_A));
    expect(voiceIntentMock).toHaveBeenLastCalledWith("user-A", "hello from nested data.text");
  });
});
