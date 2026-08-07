// Dynamic fields: the behaviour that must not regress.
//
// Four things are load bearing here and each has a test below:
//  1. Key normalisation and reserved-name rejection - a custom field named
//     `email` on a contact would be ambiguous everywhere.
//  2. Type -> column routing - a value lands in exactly one typed column and
//     every other column is nulled on the same write.
//  3. Archive vs delete - a definition holding values is archived, never
//     dropped, so history is not silently destroyed.
//  4. Tenant isolation - user B can never read or write user A's definition or
//     value, and never reaches a mutation while trying.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const OWNER = "user-A";
const ATTACKER = "user-B";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fieldDefinition: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    fieldOption: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    fieldValue: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    contact: { findUnique: vi.fn() },
    entity: { findUnique: vi.fn() },
    pipelineEntry: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  MAX_FIELDS_PER_ENTITY,
  TYPE_COLUMN,
  normalizeFieldKey,
  isReservedFieldKey,
  buildFieldValueData,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  getFieldDefinition,
  getFieldValues,
  getFieldValuesForRecords,
  setFieldValue,
  listUnfilledFields,
} from "@/lib/fields";

type Model = Record<string, Mock>;
const db = prisma as unknown as {
  fieldDefinition: Model;
  fieldOption: Model;
  fieldValue: Model;
  contact: Model;
  entity: Model;
  pipelineEntry: Model;
};

const SELECT_DEF = {
  id: "def-select",
  userId: OWNER,
  entity: "ENTITY" as const,
  key: "compliance_framework",
  label: "Compliance framework",
  type: "SELECT" as const,
  agentFilled: true,
  agentBrief: "Which security framework they are certified against.",
  required: false,
  showOnSheet: true,
  showOnTable: false,
  position: 0,
  archivedAt: null,
  options: [
    { id: "opt-soc2", fieldId: "def-select", value: "soc_2", label: "SOC 2", position: 0 },
    { id: "opt-iso", fieldId: "def-select", value: "iso_27001", label: "ISO 27001", position: 1 },
  ],
};

const TEXT_DEF = { ...SELECT_DEF, id: "def-text", key: "hq_city", label: "HQ city", type: "TEXT" as const, options: [] };

// Nothing here should ever mutate; a mutation reaching prisma is the bug.
function expectNoWrites() {
  expect(db.fieldDefinition.create).not.toHaveBeenCalled();
  expect(db.fieldDefinition.update).not.toHaveBeenCalled();
  expect(db.fieldDefinition.delete).not.toHaveBeenCalled();
  expect(db.fieldValue.upsert).not.toHaveBeenCalled();
  expect(db.fieldValue.deleteMany).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults; individual tests override what they care about.
  db.fieldDefinition.count.mockResolvedValue(0);
  db.fieldDefinition.aggregate.mockResolvedValue({ _max: { position: null } });
  db.fieldDefinition.findUnique.mockResolvedValue(null);
  db.fieldDefinition.findMany.mockResolvedValue([]);
  db.fieldValue.count.mockResolvedValue(0);
  db.fieldValue.findMany.mockResolvedValue([]);
});

/* ------------------------- 1. Key normalisation ------------------------- */

describe("normalizeFieldKey", () => {
  it("lowercases and snake_cases operator prose", () => {
    expect(normalizeFieldKey("Compliance Framework")).toBe("compliance_framework");
    expect(normalizeFieldKey("  ACV  ($) ")).toBe("acv");
    expect(normalizeFieldKey("Renewal-Date")).toBe("renewal_date");
    expect(normalizeFieldKey("already_snake")).toBe("already_snake");
  });

  it("strips accents so one concept is one key", () => {
    expect(normalizeFieldKey("Región")).toBe("region");
  });

  it("rejects a key that cannot start with a letter", () => {
    expect(() => normalizeFieldKey("2024 revenue")).toThrow(/start with a letter/i);
  });

  it("rejects input with nothing to build a key from", () => {
    expect(() => normalizeFieldKey("   ")).toThrow();
    expect(() => normalizeFieldKey("!!!")).toThrow();
  });

  it("rejects an over-long key", () => {
    expect(() => normalizeFieldKey("a".repeat(65))).toThrow(/too long/i);
  });
});

describe("reserved built-in column names", () => {
  it("reserves contact columns, in both spellings an operator might type", () => {
    for (const key of ["email", "name", "phone", "tags", "notes", "status", "last_contacted_at", "lastcontactedat"]) {
      expect(isReservedFieldKey("CONTACT", key)).toBe(true);
    }
  });

  it("only reserves what actually exists on that entity", () => {
    // Entity has no `email` column, so `email` is a perfectly good custom
    // field there even though it is forbidden on Contact.
    expect(isReservedFieldKey("ENTITY", "email")).toBe(false);
    expect(isReservedFieldKey("ENTITY", "domain")).toBe(true);
    expect(isReservedFieldKey("PIPELINE_ENTRY", "amount")).toBe(true);
    expect(isReservedFieldKey("CONTACT", "compliance_framework")).toBe(false);
  });

  it("createFieldDefinition refuses a reserved key, before touching the database", async () => {
    await expect(
      createFieldDefinition(OWNER, { entity: "CONTACT", label: "Email", type: "TEXT" }),
    ).rejects.toMatchObject({ name: "OpError", status: 400 });
    expectNoWrites();
  });

  it("createFieldDefinition derives the key from the label and normalises it", async () => {
    db.fieldDefinition.create.mockResolvedValue({ id: "new" });
    await createFieldDefinition(OWNER, {
      entity: "ENTITY",
      label: "Compliance Framework",
      type: "TEXT",
      agentBrief: "  Look for a trust page.  ",
    });
    const arg = db.fieldDefinition.create.mock.calls[0][0];
    expect(arg.data.key).toBe("compliance_framework");
    expect(arg.data.label).toBe("Compliance Framework");
    expect(arg.data.userId).toBe(OWNER);
    expect(arg.data.agentBrief).toBe("Look for a trust page.");
  });

  it("createFieldDefinition rejects a duplicate key on the same entity", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue({ id: "existing", archivedAt: null });
    await expect(
      createFieldDefinition(OWNER, { entity: "ENTITY", label: "HQ city", type: "TEXT" }),
    ).rejects.toMatchObject({ status: 409 });
    expectNoWrites();
  });
});

/* --------------------- 2. Type -> column routing --------------------- */

describe("type to column routing", () => {
  it("maps every field type to exactly one column", () => {
    expect(TYPE_COLUMN.TEXT).toBe("text");
    expect(TYPE_COLUMN.LONG_TEXT).toBe("text");
    expect(TYPE_COLUMN.URL).toBe("text");
    expect(TYPE_COLUMN.EMAIL).toBe("text");
    expect(TYPE_COLUMN.PHONE).toBe("text");
    expect(TYPE_COLUMN.NUMBER).toBe("number");
    expect(TYPE_COLUMN.DATE).toBe("date");
    expect(TYPE_COLUMN.CHECKBOX).toBe("bool");
    expect(TYPE_COLUMN.SELECT).toBe("optionId");
  });

  it("writes text into text and nulls every other column", () => {
    expect(buildFieldValueData({ type: "TEXT" }, "Berlin")).toEqual({
      text: "Berlin",
      number: null,
      date: null,
      bool: null,
      optionId: null,
    });
  });

  it("writes a number into number, keeping the decimal string exact", () => {
    expect(buildFieldValueData({ type: "NUMBER" }, 42)).toMatchObject({ number: "42", text: null });
    expect(buildFieldValueData({ type: "NUMBER" }, "1234.5600")).toMatchObject({ number: "1234.5600" });
    expect(buildFieldValueData({ type: "NUMBER" }, "1,250")).toMatchObject({ number: "1250" });
  });

  it("writes a date into date and a checkbox into bool", () => {
    const dated = buildFieldValueData({ type: "DATE" }, "2026-03-01");
    expect(dated?.date).toBeInstanceOf(Date);
    expect(dated?.text).toBeNull();
    expect(buildFieldValueData({ type: "CHECKBOX" }, true)).toMatchObject({ bool: true, text: null });
    expect(buildFieldValueData({ type: "CHECKBOX" }, "false")).toMatchObject({ bool: false });
  });

  it("rejects a value whose type does not match the definition", () => {
    expect(() => buildFieldValueData({ type: "TEXT" }, 42)).toThrow(/expected a string/i);
    expect(() => buildFieldValueData({ type: "NUMBER" }, "not a number")).toThrow(/not a number/i);
    expect(() => buildFieldValueData({ type: "NUMBER" }, Infinity)).toThrow(/finite/i);
    expect(() => buildFieldValueData({ type: "DATE" }, "the third of never")).toThrow(/not a valid date/i);
    expect(() => buildFieldValueData({ type: "CHECKBOX" }, "maybe")).toThrow(/true or false/i);
    expect(() => buildFieldValueData({ type: "SELECT", options: SELECT_DEF.options }, 7)).toThrow();
  });

  it("rejects a malformed email or link rather than storing an excuse in it", () => {
    expect(() => buildFieldValueData({ type: "EMAIL" }, "not found")).toThrow(/not an email/i);
    expect(() => buildFieldValueData({ type: "URL" }, "their website")).toThrow(/not an http/i);
    expect(() => buildFieldValueData({ type: "PHONE" }, "unknown")).toThrow(/no digits/i);
    expect(buildFieldValueData({ type: "EMAIL" }, "ada@example.com")).toMatchObject({ text: "ada@example.com" });
    expect(buildFieldValueData({ type: "URL" }, "https://example.com/trust")).toMatchObject({
      text: "https://example.com/trust",
    });
  });

  it("treats null and empty as clearing the field, not as a value", () => {
    expect(buildFieldValueData({ type: "TEXT" }, null)).toBeNull();
    expect(buildFieldValueData({ type: "TEXT" }, "   ")).toBeNull();
    expect(buildFieldValueData({ type: "NUMBER" }, undefined)).toBeNull();
    expect(buildFieldValueData({ type: "SELECT", options: SELECT_DEF.options }, "")).toBeNull();
  });
});

/* --------------------- 3. SELECT option validation --------------------- */

describe("select options", () => {
  const def = { type: "SELECT" as const, label: "Compliance framework", options: SELECT_DEF.options };

  it("resolves a value to a real option of that definition", () => {
    expect(buildFieldValueData(def, "soc_2")).toMatchObject({ optionId: "opt-soc2", text: null });
    expect(buildFieldValueData(def, "SOC 2")).toMatchObject({ optionId: "opt-soc2" });
    expect(buildFieldValueData(def, "iso_27001")).toMatchObject({ optionId: "opt-iso" });
  });

  it("never invents an option for an unknown value", () => {
    expect(() => buildFieldValueData(def, "FedRAMP")).toThrow(/not one of its options/i);
  });

  it("does not accept an option id belonging to a different field", () => {
    const other = { type: "SELECT" as const, label: "Tier", options: [{ id: "opt-x", value: "gold", label: "Gold" }] };
    expect(() => buildFieldValueData(other, "opt-soc2")).toThrow(/not one of its options/i);
  });
});

/* ----------------------- 4. Archive versus delete ----------------------- */

describe("archive versus delete", () => {
  it("archives a definition that holds values, never dropping the data", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue(TEXT_DEF);
    db.fieldValue.count.mockResolvedValue(7);
    db.fieldDefinition.update.mockResolvedValue({ ...TEXT_DEF, archivedAt: new Date() });

    const result = await deleteFieldDefinition(OWNER, TEXT_DEF.id);

    expect(result).toMatchObject({ archived: true, deleted: false, valueCount: 7 });
    expect(db.fieldDefinition.delete).not.toHaveBeenCalled();
    expect(db.fieldDefinition.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
  });

  it("hard-deletes a definition that never held a value", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue(TEXT_DEF);
    db.fieldValue.count.mockResolvedValue(0);
    db.fieldDefinition.delete.mockResolvedValue(TEXT_DEF);

    const result = await deleteFieldDefinition(OWNER, TEXT_DEF.id);

    expect(result).toMatchObject({ archived: false, deleted: true });
    expect(db.fieldDefinition.delete).toHaveBeenCalledTimes(1);
    expect(db.fieldDefinition.update).not.toHaveBeenCalled();
  });

  it("refuses to rename the key or change the type once values exist", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue(TEXT_DEF);
    db.fieldValue.count.mockResolvedValue(3);

    await expect(updateFieldDefinition(OWNER, TEXT_DEF.id, { key: "city" })).rejects.toThrow(/cannot be renamed/i);
    await expect(updateFieldDefinition(OWNER, TEXT_DEF.id, { type: "NUMBER" })).rejects.toThrow(/cannot be changed/i);
    expect(db.fieldDefinition.update).not.toHaveBeenCalled();
  });

  it("an archived definition is invisible to a write by key", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue({ ...TEXT_DEF, archivedAt: new Date() });
    await expect(setFieldValue(OWNER, "ENTITY", "ent-1", "hq_city", "Berlin")).rejects.toMatchObject({ status: 404 });
    expect(db.fieldValue.upsert).not.toHaveBeenCalled();
  });
});

/* --------------------------- 5. Value writes --------------------------- */

describe("setFieldValue", () => {
  it("routes the value into the definition's column and scopes the row to the tenant", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue(TEXT_DEF);
    db.entity.findUnique.mockResolvedValue({ userId: OWNER });
    db.fieldValue.upsert.mockResolvedValue({ fieldId: TEXT_DEF.id, text: "Berlin", number: null, date: null, bool: null, optionId: null });

    const result = await setFieldValue(OWNER, "ENTITY", "ent-1", "HQ City", "Berlin");

    const call = db.fieldValue.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ fieldId_entityId: { fieldId: TEXT_DEF.id, entityId: "ent-1" } });
    expect(call.create).toMatchObject({ userId: OWNER, fieldId: TEXT_DEF.id, entityId: "ent-1", text: "Berlin", number: null, optionId: null });
    expect(result.value).toBe("Berlin");
  });

  it("clears the field by deleting the row when the value is null", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue(TEXT_DEF);
    db.entity.findUnique.mockResolvedValue({ userId: OWNER });
    db.fieldValue.deleteMany.mockResolvedValue({ count: 1 });

    const result = await setFieldValue(OWNER, "ENTITY", "ent-1", "hq_city", null);

    expect(result.cleared).toBe(true);
    expect(db.fieldValue.upsert).not.toHaveBeenCalled();
    expect(db.fieldValue.deleteMany.mock.calls[0][0].where).toMatchObject({ userId: OWNER, fieldId: TEXT_DEF.id, entityId: "ent-1" });
  });

  it("reads a value back out of the column its type owns", async () => {
    db.fieldDefinition.findMany.mockResolvedValue([SELECT_DEF]);
    db.entity.findUnique.mockResolvedValue({ userId: OWNER });
    db.fieldValue.findMany.mockResolvedValue([
      {
        fieldId: SELECT_DEF.id,
        text: "stale text that must never surface",
        number: null,
        date: null,
        bool: null,
        optionId: "opt-soc2",
        option: { id: "opt-soc2", value: "soc_2", label: "SOC 2" },
      },
    ]);

    const out = await getFieldValues(OWNER, "ENTITY", "ent-1");
    expect(out.fields[0]).toMatchObject({ key: "compliance_framework", value: "soc_2", display: "SOC 2" });
  });
});

describe("getFieldValuesForRecords", () => {
  it("reads many records with one value query, keyed by record and field key", async () => {
    db.fieldDefinition.findMany.mockResolvedValue([TEXT_DEF]);
    db.fieldValue.findMany.mockResolvedValue([
      { fieldId: TEXT_DEF.id, entityId: "ent-1", contactId: null, pipelineEntryId: null, text: "Berlin", number: null, date: null, bool: null, optionId: null, option: null },
    ]);

    const out = await getFieldValuesForRecords(OWNER, "ENTITY", ["ent-1", "ent-2", "ent-1"]);

    expect(db.fieldValue.findMany).toHaveBeenCalledTimes(1);
    const where = db.fieldValue.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(OWNER);
    // Duplicates collapse, so the IN list is the distinct set.
    expect(where.entityId).toEqual({ in: ["ent-1", "ent-2"] });
    expect(where.field).toEqual({ entity: "ENTITY", archivedAt: null });
    expect(out.byRecord["ent-1"].hq_city.value).toBe("Berlin");
    expect(out.byRecord["ent-2"]).toEqual({});
  });
});

/* ----------------------- 6. The agent's work queue ----------------------- */

describe("listUnfilledFields", () => {
  it("returns only the empty agent-fillable fields, each with its brief", async () => {
    db.fieldDefinition.findMany.mockResolvedValue([SELECT_DEF, TEXT_DEF]);
    db.entity.findUnique.mockResolvedValue({ userId: OWNER });
    db.fieldValue.findMany.mockResolvedValue([
      { fieldId: TEXT_DEF.id, text: "Berlin", number: null, date: null, bool: null, optionId: null, option: null },
    ]);

    const out = await listUnfilledFields(OWNER, "ENTITY", "ent-1");

    expect(out.unfilled).toHaveLength(1);
    expect(out.unfilled[0]).toMatchObject({
      key: "compliance_framework",
      agentBrief: SELECT_DEF.agentBrief,
    });
    expect(out.unfilled[0].options.map((o) => o.value)).toEqual(["soc_2", "iso_27001"]);
  });
});

/* --------------------------- 7. The per-entity cap --------------------------- */

describe("per-entity cap", () => {
  it("refuses a new definition once the entity is at the cap", async () => {
    db.fieldDefinition.count.mockResolvedValue(MAX_FIELDS_PER_ENTITY);
    await expect(
      createFieldDefinition(OWNER, { entity: "CONTACT", label: "One too many", type: "TEXT" }),
    ).rejects.toThrow(new RegExp(String(MAX_FIELDS_PER_ENTITY)));
    expectNoWrites();
  });

  it("allows a new definition while under the cap", async () => {
    db.fieldDefinition.count.mockResolvedValue(MAX_FIELDS_PER_ENTITY - 1);
    db.fieldDefinition.create.mockResolvedValue({ id: "new" });
    await expect(
      createFieldDefinition(OWNER, { entity: "CONTACT", label: "Just in time", type: "TEXT" }),
    ).resolves.toMatchObject({ id: "new" });
  });
});

/* --------------------------- 8. Tenant isolation --------------------------- */

describe("tenant isolation", () => {
  it("a definition owned by another tenant is not found, and is never mutated", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue(TEXT_DEF); // owned by OWNER

    await expect(getFieldDefinition(ATTACKER, TEXT_DEF.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateFieldDefinition(ATTACKER, TEXT_DEF.id, { label: "hacked" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteFieldDefinition(ATTACKER, TEXT_DEF.id)).rejects.toMatchObject({ status: 404 });
    expectNoWrites();
  });

  it("a write to another tenant's record never reaches the value table", async () => {
    db.fieldDefinition.findUnique.mockResolvedValue({ ...TEXT_DEF, userId: ATTACKER });
    db.entity.findUnique.mockResolvedValue({ userId: OWNER }); // the record is user A's

    await expect(setFieldValue(ATTACKER, "ENTITY", "ent-1", "hq_city", "Berlin")).rejects.toMatchObject({ status: 404 });
    expect(db.fieldValue.upsert).not.toHaveBeenCalled();
    expect(db.fieldValue.deleteMany).not.toHaveBeenCalled();
  });

  it("reading another tenant's record returns nothing readable", async () => {
    db.contact.findUnique.mockResolvedValue({ userId: OWNER });
    await expect(getFieldValues(ATTACKER, "CONTACT", "contact-1")).rejects.toMatchObject({ status: 404 });
    await expect(listUnfilledFields(ATTACKER, "CONTACT", "contact-1")).rejects.toMatchObject({ status: 404 });
    expect(db.fieldValue.findMany).not.toHaveBeenCalled();
  });

  it("a definition lookup by key is scoped to the caller's own tenant", async () => {
    // The unique lookup includes userId, so a foreign key simply misses.
    db.fieldDefinition.findUnique.mockResolvedValue(null);
    db.entity.findUnique.mockResolvedValue({ userId: ATTACKER });

    await expect(setFieldValue(ATTACKER, "ENTITY", "ent-9", "hq_city", "Berlin")).rejects.toMatchObject({ status: 404 });
    expect(db.fieldDefinition.findUnique.mock.calls[0][0].where).toEqual({
      userId_entity_key: { userId: ATTACKER, entity: "ENTITY", key: "hq_city" },
    });
    expect(db.fieldValue.upsert).not.toHaveBeenCalled();
  });

  it("every list read is scoped by userId", async () => {
    db.fieldDefinition.findMany.mockResolvedValue([]);
    db.contact.findUnique.mockResolvedValue({ userId: ATTACKER });
    await getFieldValues(ATTACKER, "CONTACT", "contact-1");
    expect(db.fieldDefinition.findMany.mock.calls[0][0].where.userId).toBe(ATTACKER);
    expect(db.fieldValue.findMany.mock.calls[0][0].where.userId).toBe(ATTACKER);
  });
});
