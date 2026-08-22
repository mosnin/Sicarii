// Integration of self-optimizing outreach into the shared ops layer:
// logOutreach/saveSocialMessage record a VariantSend when a caller supplies
// variantId, and saveSocialMessage attributes a reply when an INBOUND message
// advances a contact CONTACTED -> REPLIED. Also pins backward compatibility:
// both functions must behave exactly as before when variantId is omitted.
//
// Mocks @/lib/prisma (array-form $transaction, same convention as
// tests/enum-normalization.test.ts) and @/lib/variant-operations (so this
// tests the INTEGRATION wiring in crm-operations.ts, not variant-operations.ts
// internals - those have their own dedicated test file).

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindUnique = vi.fn();
const contactUpdate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "c1", ...args.data }),
);
const activityCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "a1", ...args.data }),
);
const contactSocialMessageCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "m1", ...args.data }),
);
const variantSendCreate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "vs1", ...args.data }),
);
const outreachVariantUpdate = vi.fn((args: unknown) => Promise.resolve(args));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (args: unknown) => contactFindUnique(args),
      update: (args: { data: Record<string, unknown> }) => contactUpdate(args),
    },
    activity: {
      create: (args: { data: Record<string, unknown> }) => activityCreate(args),
    },
    contactSocialMessage: {
      create: (args: { data: Record<string, unknown> }) => contactSocialMessageCreate(args),
    },
    variantSend: {
      create: (args: { data: Record<string, unknown> }) => variantSendCreate(args),
    },
    outreachVariant: {
      update: (args: unknown) => outreachVariantUpdate(args),
    },
    // logOutreach/saveSocialMessage use the array form: $transaction([...]).
    // Array members are already-invoked mock promises by the time
    // $transaction sees them, so Promise.all is a faithful stand-in (same
    // pattern as tests/enum-normalization.test.ts).
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const assertVariantOwned = vi.fn().mockResolvedValue(undefined);
const attributeReply = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/variant-operations", () => ({
  assertVariantOwned: (...args: unknown[]) => assertVariantOwned(...args),
  attributeReply: (...args: unknown[]) => attributeReply(...args),
}));

import { logOutreach, saveSocialMessage } from "@/lib/crm-operations";

const USER = "user-1";

beforeEach(() => {
  contactFindUnique.mockReset().mockResolvedValue({ id: "c1", userId: USER, status: "NEW" });
  contactUpdate.mockClear();
  activityCreate.mockClear();
  contactSocialMessageCreate.mockClear();
  variantSendCreate.mockClear();
  outreachVariantUpdate.mockClear();
  assertVariantOwned.mockClear().mockResolvedValue(undefined);
  attributeReply.mockClear().mockResolvedValue(undefined);
});

describe("logOutreach + variant attribution", () => {
  it("backward-compat: works exactly as before with no variantId (no variant calls at all)", async () => {
    const result = await logOutreach(USER, { contactId: "c1", summary: "sent a note" });
    expect(result.id).toBe("c1");
    expect(assertVariantOwned).not.toHaveBeenCalled();
    expect(variantSendCreate).not.toHaveBeenCalled();
    expect(outreachVariantUpdate).not.toHaveBeenCalled();
    // Exactly the original two-item transaction: contact update + activity.
    expect(contactUpdate).toHaveBeenCalledTimes(1);
    expect(activityCreate).toHaveBeenCalledTimes(1);
  });

  it("with variantId: verifies ownership, records a VariantSend, and increments sends", async () => {
    await logOutreach(USER, { contactId: "c1", summary: "sent a note", variantId: "v1" });
    expect(assertVariantOwned).toHaveBeenCalledWith(USER, "v1");
    expect(variantSendCreate).toHaveBeenCalledTimes(1);
    const sendData = variantSendCreate.mock.calls[0][0].data as { variantId: string; contactId: string };
    expect(sendData.variantId).toBe("v1");
    expect(sendData.contactId).toBe("c1");
    expect(outreachVariantUpdate).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { sends: { increment: 1 } },
    });
  });

  it("propagates an ownership failure and never records a send for a variant the caller does not own", async () => {
    assertVariantOwned.mockRejectedValue(Object.assign(new Error("Invalid variant"), { name: "OpError", status: 400 }));
    await expect(
      logOutreach(USER, { contactId: "c1", summary: "x", variantId: "not-mine" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(variantSendCreate).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });
});

describe("saveSocialMessage + variant attribution", () => {
  it("backward-compat: OUTBOUND with no variantId behaves exactly as before", async () => {
    await saveSocialMessage(USER, { contactId: "c1", channel: "LINKEDIN", direction: "OUTBOUND", body: "hi" });
    expect(assertVariantOwned).not.toHaveBeenCalled();
    expect(variantSendCreate).not.toHaveBeenCalled();
    expect(contactSocialMessageCreate).toHaveBeenCalledTimes(1);
    expect(contactUpdate).toHaveBeenCalledTimes(1);
  });

  it("OUTBOUND with variantId records a VariantSend and bumps sends", async () => {
    await saveSocialMessage(USER, {
      contactId: "c1",
      channel: "LINKEDIN",
      direction: "OUTBOUND",
      body: "hi",
      variantId: "v1",
    });
    expect(assertVariantOwned).toHaveBeenCalledWith(USER, "v1");
    expect(variantSendCreate).toHaveBeenCalledTimes(1);
    expect(outreachVariantUpdate).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { sends: { increment: 1 } },
    });
  });

  it("INBOUND that flips CONTACTED -> REPLIED calls attributeReply exactly once", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "CONTACTED" });
    await saveSocialMessage(USER, { contactId: "c1", channel: "LINKEDIN", direction: "INBOUND", body: "sure, tell me more" });
    expect(attributeReply).toHaveBeenCalledTimes(1);
    expect(attributeReply).toHaveBeenCalledWith("c1");
  });

  it("INBOUND that does NOT change status (contact not CONTACTED) never calls attributeReply", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "NEW" });
    await saveSocialMessage(USER, { contactId: "c1", channel: "LINKEDIN", direction: "INBOUND", body: "hello" });
    expect(attributeReply).not.toHaveBeenCalled();
  });

  it("a second INBOUND after the contact is already REPLIED does not re-attribute (status stays REPLIED, no repeat call)", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: USER, status: "REPLIED" });
    await saveSocialMessage(USER, { contactId: "c1", channel: "LINKEDIN", direction: "INBOUND", body: "another message" });
    expect(attributeReply).not.toHaveBeenCalled();
  });

  it("OUTBOUND never records a send without verifying variant ownership first", async () => {
    assertVariantOwned.mockRejectedValue(Object.assign(new Error("Invalid variant"), { name: "OpError", status: 400 }));
    await expect(
      saveSocialMessage(USER, { contactId: "c1", channel: "LINKEDIN", direction: "OUTBOUND", body: "hi", variantId: "not-mine" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(variantSendCreate).not.toHaveBeenCalled();
    expect(contactSocialMessageCreate).not.toHaveBeenCalled();
  });
});
