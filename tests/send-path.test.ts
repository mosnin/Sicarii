// Outreach/send-path correctness: a send that did not happen must not look
// like a send, inbound email must advance the same pipeline as inbound social,
// and log_outreach must never walk a contact backwards.

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
const activityCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "a1", ...args.data }),
);
const userFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (args: unknown) => contactFindUnique(args),
      update: (args: { data: Record<string, unknown> }) => contactUpdate(args),
    },
    contactEmail: {
      create: (args: { data: Record<string, unknown> }) => contactEmailCreate(args),
    },
    contactCall: {
      create: (args: { data: Record<string, unknown> }) => contactCallCreate(args),
    },
    activity: {
      create: (args: { data: Record<string, unknown> }) => activityCreate(args),
    },
    user: {
      findUnique: (args: unknown) => userFindUnique(args),
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const placeCall = vi.fn();
vi.mock("@/lib/agentphone", () => ({
  placeCall: (...args: unknown[]) => placeCall(...args),
  getCall: vi.fn(),
}));

const attributeReply = vi.fn().mockResolvedValue(undefined);
const assertVariantOwned = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/variant-operations", () => ({
  attributeReply: (...args: unknown[]) => attributeReply(...args),
  assertVariantOwned: (...args: unknown[]) => assertVariantOwned(...args),
}));

import { saveEmail, logOutreach, placeContactCall } from "@/lib/crm-operations";

const USER = "user-1";

beforeEach(() => {
  contactFindUnique.mockReset().mockResolvedValue({ id: "c1", userId: USER, status: "NEW" });
  contactUpdate.mockClear();
  contactEmailCreate.mockClear();
  contactCallCreate.mockClear();
  activityCreate.mockClear();
  userFindUnique.mockReset().mockResolvedValue({ agentPhoneApiKey: "sk_live_test" });
  placeCall.mockReset();
  attributeReply.mockReset().mockResolvedValue(undefined);
  assertVariantOwned.mockReset().mockResolvedValue(undefined);
});

describe("saveEmail pipeline (mirrors saveSocialMessage)", () => {
  it("OUTBOUND on NEW stamps lastContactedAt and advances to CONTACTED", async () => {
    await saveEmail(USER, { contactId: "c1", direction: "OUTBOUND", subject: "hi", body: "hello" });
    expect(contactEmailCreate).toHaveBeenCalledTimes(1);
    expect(contactUpdate).toHaveBeenCalledTimes(1);
    const data = contactUpdate.mock.calls[0][0].data as { status?: string; lastContactedAt?: Date };
    expect(data.status).toBe("CONTACTED");
    expect(data.lastContactedAt).toBeInstanceOf(Date);
    expect(attributeReply).not.toHaveBeenCalled();
  });

  it("OUTBOUND on REPLIED stamps lastContactedAt and does not downgrade", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "REPLIED" });
    await saveEmail(USER, { contactId: "c1", direction: "OUTBOUND", subject: "follow up" });
    const data = contactUpdate.mock.calls[0][0].data as { status?: string; lastContactedAt?: Date };
    expect(data.status).toBeUndefined();
    expect(data.lastContactedAt).toBeInstanceOf(Date);
  });

  it("INBOUND on CONTACTED advances to REPLIED and attributes the reply", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "CONTACTED" });
    await saveEmail(USER, { contactId: "c1", direction: "INBOUND", subject: "re: hi", body: "yes" });
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "REPLIED" },
    });
    expect(attributeReply).toHaveBeenCalledTimes(1);
    expect(attributeReply).toHaveBeenCalledWith("c1");
  });

  it("INBOUND still calls attributeReply when status does not flip, and still saves the email if attribution throws", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "NEW" });
    attributeReply.mockRejectedValueOnce(new Error("db blip"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const email = await saveEmail(USER, { contactId: "c1", direction: "INBOUND", body: "hello" });
    expect(email).toMatchObject({ contactId: "c1" });
    expect(contactEmailCreate).toHaveBeenCalledTimes(1);
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(attributeReply).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("denies a non-owner and never writes an email", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "NEW" });
    await expect(
      saveEmail("attacker", { contactId: "c1", direction: "OUTBOUND", body: "x" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(contactEmailCreate).not.toHaveBeenCalled();
  });
});

describe("logOutreach never downgrades status", () => {
  it("default path still advances NEW -> CONTACTED", async () => {
    const result = await logOutreach(USER, { contactId: "c1", summary: "sent a note" });
    expect(result.status).toBe("CONTACTED");
  });

  it("ignores an explicit NEW (or CONTACTED) on a REPLIED contact", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "REPLIED" });
    await logOutreach(USER, { contactId: "c1", summary: "ping", status: "NEW" });
    const data = contactUpdate.mock.calls[0][0].data as { status: string };
    expect(data.status).toBe("REPLIED");
  });

  it("allows an explicit advance (CONTACTED -> QUALIFIED) or close (LOST)", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "CONTACTED" });
    await logOutreach(USER, { contactId: "c1", summary: "good call", status: "QUALIFIED" });
    expect((contactUpdate.mock.calls[0][0].data as { status: string }).status).toBe("QUALIFIED");

    contactUpdate.mockClear();
    await logOutreach(USER, { contactId: "c1", summary: "dead", status: "LOST" });
    expect((contactUpdate.mock.calls[0][0].data as { status: string }).status).toBe("LOST");
  });

  it("does not walk WON back to CONTACTED", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "WON" });
    await logOutreach(USER, { contactId: "c1", summary: "thanks", status: "CONTACTED" });
    expect((contactUpdate.mock.calls[0][0].data as { status: string }).status).toBe("WON");
  });
});

describe("placeContactCall refuses an unparseable send", () => {
  it("throws 502 and writes nothing when AgentPhone returns no call id", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "NEW", phone: "+15551234567" });
    placeCall.mockResolvedValue({ callId: "", status: "queued" });
    await expect(
      placeContactCall(USER, { contactId: "c1", systemPrompt: "hi" }),
    ).rejects.toMatchObject({ status: 502 });
    expect(contactCallCreate).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });

  it("logs the call and marks CONTACTED when a real call id comes back", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "NEW", phone: "+15551234567" });
    placeCall.mockResolvedValue({ callId: "call_123", status: "queued" });
    const result = await placeContactCall(USER, { contactId: "c1", systemPrompt: "hi" });
    expect(result.callId).toBe("call_123");
    expect(contactCallCreate).toHaveBeenCalledTimes(1);
    expect((contactCallCreate.mock.calls[0][0].data as { agentPhoneCallId: string }).agentPhoneCallId).toBe(
      "call_123",
    );
    expect((contactUpdate.mock.calls[0][0].data as { status: string }).status).toBe("CONTACTED");
  });

  it("denies a non-owner before placing a live call", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "NEW", phone: "+15551234567" });
    await expect(
      placeContactCall("attacker", { contactId: "c1", systemPrompt: "hi" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(placeCall).not.toHaveBeenCalled();
  });
});
