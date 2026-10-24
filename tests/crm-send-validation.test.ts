// Send-path honesty that is already true on main and is not covered by
// isolation or variant-attribution tests:
//   - saveEmail / saveCall refuse another user's contact before writing
//   - placeContactCall never dials without a key, a phone number, or ownership
//   - placeContactCall / logOutreach never walk a later-stage contact back
//     on the default (no explicit status) path
//   - syncContactCall refuses a log with no AgentPhone id, and a user with
//     no key, before any provider call
//
// Does not pin #64's still-unmerged pipeline/no-downgrade-on-explicit-status
// behavior — those tests live on that PR.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindUnique = vi.fn();
const contactUpdate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "c1", ...args.data }),
);
const contactEmailCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "e1", ...args.data }),
);
const contactCallCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "call1", ...args.data }),
);
const contactCallFindUnique = vi.fn();
const contactCallUpdate = vi.fn();
const contactCallFindMany = vi.fn();
const activityCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "a1", ...args.data }),
);
const userFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (...a: unknown[]) => contactFindUnique(...a),
      update: (args: { data: Record<string, unknown> }) => contactUpdate(args),
    },
    contactEmail: {
      create: (args: { data: Record<string, unknown> }) => contactEmailCreate(args),
    },
    contactCall: {
      create: (args: { data: Record<string, unknown> }) => contactCallCreate(args),
      findUnique: (...a: unknown[]) => contactCallFindUnique(...a),
      update: (...a: unknown[]) => contactCallUpdate(...a),
      findMany: (...a: unknown[]) => contactCallFindMany(...a),
    },
    activity: {
      create: (args: { data: Record<string, unknown> }) => activityCreate(args),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const placeCall = vi.fn();
const getCall = vi.fn();
vi.mock("@/lib/agentphone", () => ({
  placeCall: (...args: unknown[]) => placeCall(...args),
  getCall: (...args: unknown[]) => getCall(...args),
}));

vi.mock("@/lib/variant-operations", () => ({
  assertVariantOwned: vi.fn().mockResolvedValue(undefined),
  attributeReply: vi.fn().mockResolvedValue(undefined),
}));

import {
  saveEmail,
  saveCall,
  placeContactCall,
  logOutreach,
  syncContactCall,
} from "@/lib/crm-operations";

const USER = "user-1";
const ATTACKER = "user-2";

beforeEach(() => {
  contactFindUnique.mockReset().mockResolvedValue({
    id: "c1",
    userId: USER,
    status: "NEW",
    phone: "+15551234567",
  });
  contactUpdate.mockClear();
  contactEmailCreate.mockClear();
  contactCallCreate.mockClear();
  contactCallFindUnique.mockReset();
  contactCallUpdate.mockReset();
  contactCallFindMany.mockReset();
  activityCreate.mockClear();
  userFindUnique.mockReset().mockResolvedValue({ agentPhoneApiKey: "sk_live_test" });
  placeCall.mockReset().mockResolvedValue({ callId: "call_123", status: "queued" });
  getCall.mockReset();
});

describe("saveEmail / saveCall tenant isolation", () => {
  it("saveEmail denies a non-owner and never writes an email row", async () => {
    await expect(
      saveEmail(ATTACKER, { contactId: "c1", direction: "OUTBOUND", body: "x" }),
    ).rejects.toMatchObject({ name: "OpError", status: 404 });
    expect(contactEmailCreate).not.toHaveBeenCalled();
  });

  it("saveCall denies a non-owner and never writes a call row", async () => {
    await expect(
      saveCall(ATTACKER, { contactId: "c1", direction: "OUTBOUND", toNumber: "+15550001111" }),
    ).rejects.toMatchObject({ name: "OpError", status: 404 });
    expect(contactCallCreate).not.toHaveBeenCalled();
  });

  it("saveEmail writes for the real owner", async () => {
    await saveEmail(USER, { contactId: "c1", direction: "INBOUND", subject: "re: hi" });
    expect(contactEmailCreate).toHaveBeenCalledTimes(1);
    expect(contactEmailCreate.mock.calls[0][0].data.contactId).toBe("c1");
  });
});

describe("placeContactCall validation", () => {
  it("throws 501 and never dials when the user has no AgentPhone key", async () => {
    userFindUnique.mockResolvedValue({ agentPhoneApiKey: null });
    await expect(
      placeContactCall(USER, { contactId: "c1", systemPrompt: "hi" }),
    ).rejects.toMatchObject({ name: "OpError", status: 501 });
    expect(placeCall).not.toHaveBeenCalled();
    expect(contactCallCreate).not.toHaveBeenCalled();
    expect(contactFindUnique).not.toHaveBeenCalled();
  });

  it("throws 400 and never dials when neither toNumber nor contact.phone is set", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "NEW", phone: null });
    await expect(
      placeContactCall(USER, { contactId: "c1", systemPrompt: "hi" }),
    ).rejects.toMatchObject({ name: "OpError", status: 400 });
    expect(placeCall).not.toHaveBeenCalled();
    expect(contactCallCreate).not.toHaveBeenCalled();
  });

  it("treats whitespace-only toNumber / phone as missing", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "NEW", phone: "   " });
    await expect(
      placeContactCall(USER, { contactId: "c1", systemPrompt: "hi", toNumber: "  " }),
    ).rejects.toMatchObject({ status: 400 });
    expect(placeCall).not.toHaveBeenCalled();
  });

  it("denies a non-owner before placing a live call", async () => {
    await expect(
      placeContactCall(ATTACKER, { contactId: "c1", systemPrompt: "hi" }),
    ).rejects.toMatchObject({ name: "OpError", status: 404 });
    expect(placeCall).not.toHaveBeenCalled();
    expect(contactCallCreate).not.toHaveBeenCalled();
  });

  it("does not downgrade QUALIFIED when a real call is placed", async () => {
    contactFindUnique.mockResolvedValue({
      id: "c1",
      userId: USER,
      status: "QUALIFIED",
      phone: "+15551234567",
    });
    await placeContactCall(USER, { contactId: "c1", systemPrompt: "hi" });
    expect(placeCall).toHaveBeenCalledTimes(1);
    const data = contactUpdate.mock.calls[0][0].data as { status?: string; lastContactedAt?: Date };
    expect(data.status).toBeUndefined();
    expect(data.lastContactedAt).toBeInstanceOf(Date);
  });

  it("advances NEW -> CONTACTED after a placed call", async () => {
    await placeContactCall(USER, { contactId: "c1", systemPrompt: "hi" });
    expect((contactUpdate.mock.calls[0][0].data as { status: string }).status).toBe("CONTACTED");
  });
});

describe("logOutreach default status machine", () => {
  it("advances NEW -> CONTACTED when no explicit status is given", async () => {
    const result = await logOutreach(USER, { contactId: "c1", summary: "sent a note" });
    expect(result.status).toBe("CONTACTED");
  });

  it("advances ENRICHED -> CONTACTED", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "ENRICHED" });
    const result = await logOutreach(USER, { contactId: "c1", summary: "sent a note" });
    expect(result.status).toBe("CONTACTED");
  });

  it("leaves QUALIFIED / WON / REPLIED alone when no explicit status is given", async () => {
    for (const status of ["QUALIFIED", "WON", "REPLIED"] as const) {
      contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status });
      contactUpdate.mockClear();
      const result = await logOutreach(USER, { contactId: "c1", summary: "nudge" });
      expect(result.status).toBe(status);
    }
  });
});

describe("syncContactCall preconditions", () => {
  it("throws 400 when the log has no AgentPhone id, and never calls the provider", async () => {
    contactCallFindUnique.mockResolvedValue({
      id: "call1",
      agentPhoneCallId: null,
      contact: { userId: USER },
    });
    await expect(syncContactCall(USER, "call1")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(getCall).not.toHaveBeenCalled();
    expect(contactCallUpdate).not.toHaveBeenCalled();
  });

  it("throws 501 when the user has no AgentPhone key, and never calls the provider", async () => {
    contactCallFindUnique.mockResolvedValue({
      id: "call1",
      agentPhoneCallId: "ap1",
      contact: { userId: USER },
    });
    userFindUnique.mockResolvedValue({ agentPhoneApiKey: null });
    await expect(syncContactCall(USER, "call1")).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
    expect(getCall).not.toHaveBeenCalled();
    expect(contactCallUpdate).not.toHaveBeenCalled();
  });
});
