// Tenant-isolation boundary tests for the shared ops layer.
//
// This is the single most important safety property of the product: a user must
// never read, modify, or delete another user's records. Every ops function that
// accepts a caller-supplied id does `findUnique` then an ownership check before
// touching the row. These tests prove that boundary holds: with prisma mocked to
// return a record owned by USER A, every function called as USER B must throw
// and must NEVER reach a mutation (update/delete/create). A mutation spy that
// throws on call turns any regression into a loud failure.

import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

vi.mock("@/lib/prisma", () => {
  // Inlined inside the factory: vi.mock is hoisted above module-level consts.
  const owner = "user-A";
  const forbid = (name: string) =>
    vi.fn(() => {
      throw new Error(`ISOLATION BREACH: ${name} was called on an unauthorized record`);
    });
  return {
    prisma: {
      contact: {
        findUnique: vi.fn().mockResolvedValue({ id: "c1", userId: owner, status: "NEW" }),
        update: forbid("contact.update"),
        delete: forbid("contact.delete"),
      },
      entity: {
        findUnique: vi.fn().mockResolvedValue({ id: "e1", userId: owner, domain: "x.com" }),
        update: forbid("entity.update"),
        delete: forbid("entity.delete"),
      },
      contactCall: {
        findUnique: vi.fn().mockResolvedValue({
          id: "call1",
          agentPhoneCallId: "ap1",
          status: "completed",
          contact: { userId: owner },
        }),
        update: forbid("contactCall.update"),
        create: forbid("contactCall.create"),
        findMany: forbid("contactCall.findMany"),
      },
      activity: { create: forbid("activity.create") },
      user: { findUnique: vi.fn().mockResolvedValue({ agentPhoneApiKey: "k" }) },
      $transaction: forbid("$transaction"),
    },
  };
});

import {
  getEntity,
  updateEntity,
  deleteEntity,
  enrichEntity,
  getContact,
  updateContact,
  deleteContact,
  addActivity,
  logOutreach,
  listContactCalls,
  syncContactCall,
  OpError,
} from "@/lib/crm-operations";

async function expectDenied(fn: () => Promise<unknown>) {
  await expect(fn()).rejects.toMatchObject({
    name: "OpError",
    status: 404,
  });
}

describe("ops-layer tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("entity reads/writes deny a non-owner", async () => {
    await expectDenied(() => getEntity(ATTACKER, "e1"));
    await expectDenied(() => updateEntity(ATTACKER, "e1", { name: "hacked" }));
    await expectDenied(() => deleteEntity(ATTACKER, "e1"));
    await expectDenied(() => enrichEntity(ATTACKER, "e1"));
  });

  it("contact reads/writes deny a non-owner", async () => {
    await expectDenied(() => getContact(ATTACKER, "c1"));
    await expectDenied(() => updateContact(ATTACKER, "c1", { name: "hacked" }));
    await expectDenied(() => deleteContact(ATTACKER, "c1"));
  });

  it("activity + outreach deny a non-owner of the target record", async () => {
    await expectDenied(() => addActivity(ATTACKER, { contactId: "c1", kind: "note", body: "x" }));
    await expectDenied(() => addActivity(ATTACKER, { entityId: "e1", kind: "note", body: "x" }));
    await expectDenied(() => logOutreach(ATTACKER, { contactId: "c1", summary: "x" }));
  });

  it("call history + sync deny a non-owner of the parent contact", async () => {
    await expectDenied(() => listContactCalls(ATTACKER, "c1"));
    await expectDenied(() => syncContactCall(ATTACKER, "call1"));
  });

  it("the owner is allowed through the ownership gate (reads do not throw 404)", async () => {
    // getEntity/getContact for the real owner return the record, proving the
    // gate is an ownership check and not a blanket deny.
    await expect(getEntity(OWNER, "e1")).resolves.toMatchObject({ id: "e1" });
    await expect(getContact(OWNER, "c1")).resolves.toMatchObject({ id: "c1" });
  });

  it("addActivity with neither contactId nor entityId is rejected (no orphan rows)", async () => {
    await expect(addActivity(OWNER, { kind: "note", body: "x" })).rejects.toMatchObject({
      name: "OpError",
    });
  });
});

// A tiny sanity check that OpError carries the status the routes rely on.
describe("OpError", () => {
  it("defaults to 400 and carries an explicit status", () => {
    expect(new OpError("x").status).toBe(400);
    expect(new OpError("y", 404).status).toBe(404);
  });
});
