// Contact <-> entity linking must never attach a contact to another user's
// company. createContact / updateContact call assertEntityOwned before any
// write; a stolen entityId must 400 and never reach contact.create/update.

import { describe, it, expect, vi, beforeEach } from "vitest";

const entityFindUnique = vi.fn();
const contactFindUnique = vi.fn();
const contactCreate = vi.fn();
const contactUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: { findUnique: (...a: unknown[]) => entityFindUnique(...a) },
    contact: {
      findUnique: (...a: unknown[]) => contactFindUnique(...a),
      create: (...a: unknown[]) => contactCreate(...a),
      update: (...a: unknown[]) => contactUpdate(...a),
    },
  },
}));

import { createContact, updateContact } from "@/lib/crm-operations";

const OWNER = "user-A";
const ATTACKER = "user-B";

beforeEach(() => {
  entityFindUnique.mockReset();
  contactFindUnique.mockReset();
  contactCreate.mockReset().mockResolvedValue({ id: "c-new" });
  contactUpdate.mockReset().mockResolvedValue({ id: "c1" });
});

describe("createContact entity ownership", () => {
  it("rejects a stolen entityId and never creates the contact", async () => {
    entityFindUnique.mockResolvedValue({ id: "e-stolen", userId: OWNER });

    await expect(
      createContact(ATTACKER, { name: "Jane", entityId: "e-stolen" }),
    ).rejects.toMatchObject({ name: "OpError", status: 400, message: "Invalid entity" });

    expect(entityFindUnique).toHaveBeenCalledWith({ where: { id: "e-stolen" } });
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing entityId target the same way (no create)", async () => {
    entityFindUnique.mockResolvedValue(null);

    await expect(createContact(OWNER, { name: "Jane", entityId: "nope" })).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it("creates when the entity belongs to the caller", async () => {
    entityFindUnique.mockResolvedValue({ id: "e1", userId: OWNER });
    await createContact(OWNER, { name: "Jane", entityId: "e1" });
    expect(contactCreate).toHaveBeenCalledTimes(1);
    expect(contactCreate.mock.calls[0][0].data.entityId).toBe("e1");
    expect(contactCreate.mock.calls[0][0].data.userId).toBe(OWNER);
  });

  it("skips the entity lookup when no entityId is supplied", async () => {
    await createContact(OWNER, { name: "Jane" });
    expect(entityFindUnique).not.toHaveBeenCalled();
    expect(contactCreate).toHaveBeenCalledTimes(1);
  });
});

describe("updateContact entity ownership", () => {
  it("rejects re-linking an owned contact onto a stolen entity", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: OWNER });
    entityFindUnique.mockResolvedValue({ id: "e-stolen", userId: ATTACKER });

    await expect(updateContact(OWNER, "c1", { entityId: "e-stolen" })).rejects.toMatchObject({
      name: "OpError",
      status: 400,
      message: "Invalid entity",
    });
    expect(contactUpdate).not.toHaveBeenCalled();
  });

  it("does not consult entity ownership when entityId is omitted", async () => {
    contactFindUnique.mockResolvedValue({ id: "c1", userId: OWNER });
    await updateContact(OWNER, "c1", { name: "Jane Doe" });
    expect(entityFindUnique).not.toHaveBeenCalled();
    expect(contactUpdate).toHaveBeenCalledTimes(1);
  });
});
