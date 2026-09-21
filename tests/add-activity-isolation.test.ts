// addActivity is the path that logs a note/call/reply without overwriting
// the CRM notes field. It must refuse a contact or company the caller does
// not own (and refuse an orphan call with neither id) so one tenant cannot
// write onto another tenant's activity trail.

import { describe, it, expect, vi, beforeEach } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

const contactFindUnique = vi.fn();
const entityFindUnique = vi.fn();
const activityCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findUnique: (...args: unknown[]) => contactFindUnique(...args) },
    entity: { findUnique: (...args: unknown[]) => entityFindUnique(...args) },
    activity: { create: (...args: unknown[]) => activityCreate(...args) },
  },
}));

import { addActivity, OpError } from "@/lib/crm-operations";

describe("addActivity isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactFindUnique.mockResolvedValue(null);
    entityFindUnique.mockResolvedValue(null);
    activityCreate.mockResolvedValue({ id: "act-1" });
  });

  it("404s a contact owned by someone else and never inserts", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: OWNER });
    await expect(
      addActivity(ATTACKER, { contactId: "c1", kind: "note", body: "hello" }),
    ).rejects.toMatchObject({ name: "OpError", status: 404 });
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it("404s an entity owned by someone else and never inserts", async () => {
    entityFindUnique.mockResolvedValue({ id: "e1", userId: OWNER });
    await expect(
      addActivity(ATTACKER, { entityId: "e1", kind: "note", body: "hello" }),
    ).rejects.toMatchObject({ name: "OpError", status: 404 });
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it("400s when neither contactId nor entityId is provided", async () => {
    await expect(addActivity(OWNER, { kind: "note", body: "hello" })).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(contactFindUnique).not.toHaveBeenCalled();
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it("inserts a note on a contact the caller owns", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: OWNER });
    await addActivity(OWNER, { contactId: "c1", kind: "note", body: "hello" });
    expect(activityCreate).toHaveBeenCalledWith({
      data: {
        userId: OWNER,
        contactId: "c1",
        entityId: null,
        kind: "note",
        body: "hello",
        channel: null,
        actorId: null,
        actorLabel: null,
      },
    });
  });

  it("is an OpError, not a generic throw, so routes can map the status", () => {
    expect(new OpError("Contact not found", 404)).toMatchObject({
      name: "OpError",
      status: 404,
    });
  });
});
