// Dynamic fields - the userId-scoped ops layer for operator-defined columns on
// contacts, companies, and deals. Every caller (REST routes, the MCP server,
// the UI) goes through here so validation, type routing, and ownership checks
// stay identical everywhere.
//
// The whole point of this module is `agentBrief`: the operator writes, in plain
// prose, what a field means and how to find it. The agent reads that brief over
// MCP and fills the field itself, with no code change from us. A field is a
// question the operator wrote down.
//
// Two invariants are load bearing and must never be relaxed:
//  1. A value is written into the ONE typed column its definition's type maps
//     to, and every other column is explicitly nulled on the same write. A
//     number must never end up in `text`, and a type change must never leave a
//     stale value behind in the old column.
//  2. A definition that already holds values is ARCHIVED, never hard-deleted.
//     Deleting it would cascade the values away and silently destroy history.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";

export { OpError };

/* ----------------------------- Vocabulary ----------------------------- */

export const FIELD_ENTITIES = ["CONTACT", "ENTITY", "PIPELINE_ENTRY"] as const;
export type FieldEntityName = (typeof FIELD_ENTITIES)[number];

export const FIELD_TYPES = [
  "TEXT",
  "LONG_TEXT",
  "NUMBER",
  "DATE",
  "CHECKBOX",
  "SELECT",
  "URL",
  "EMAIL",
  "PHONE",
] as const;
export type FieldTypeName = (typeof FIELD_TYPES)[number];

/** The typed FieldValue column each field type writes into. */
export const TYPE_COLUMN = {
  TEXT: "text",
  LONG_TEXT: "text",
  URL: "text",
  EMAIL: "text",
  PHONE: "text",
  NUMBER: "number",
  DATE: "date",
  CHECKBOX: "bool",
  SELECT: "optionId",
} as const satisfies Record<FieldTypeName, "text" | "number" | "date" | "bool" | "optionId">;

export type FieldColumn = (typeof TYPE_COLUMN)[FieldTypeName];

// Caps. A schema an operator can't hold in their head isn't a schema, and an
// uncapped definition table lets one tenant's agent create thousands of columns
// that every record read then has to join against.
export const MAX_FIELDS_PER_ENTITY = 50;
export const MAX_OPTIONS_PER_FIELD = 100;
export const MAX_KEY_LENGTH = 64;
export const MAX_LABEL_LENGTH = 80;
export const MAX_BRIEF_LENGTH = 4000;

// Per-type text ceilings. LONG_TEXT is the only field meant to hold prose.
const TEXT_LIMITS: Record<string, number> = {
  TEXT: 2000,
  LONG_TEXT: 20000,
  URL: 2000,
  EMAIL: 320,
  PHONE: 50,
};

export function isFieldEntity(v: unknown): v is FieldEntityName {
  return typeof v === "string" && (FIELD_ENTITIES as readonly string[]).includes(v);
}

export function isFieldType(v: unknown): v is FieldTypeName {
  return typeof v === "string" && (FIELD_TYPES as readonly string[]).includes(v);
}

function requireEntity(v: unknown): FieldEntityName {
  if (!isFieldEntity(v)) {
    throw new OpError(`entity must be one of ${FIELD_ENTITIES.join(", ")}`, 400);
  }
  return v;
}

function requireType(v: unknown): FieldTypeName {
  if (!isFieldType(v)) {
    throw new OpError(`type must be one of ${FIELD_TYPES.join(", ")}`, 400);
  }
  return v;
}

/* -------------------------- Key normalisation -------------------------- */

// Built-in columns per entity. A custom field named `email` on a contact would
// be ambiguous in every filter, export, and agent prompt ("which email?"), so
// we reject the collision at definition time rather than disambiguate forever.
const CONTACT_COLUMNS = [
  "id", "userId", "entityId", "name", "email", "phone", "company", "title",
  "website", "linkedin", "facebook", "instagram", "twitter", "location",
  "imageUrl", "status", "source", "tags", "notes", "lastContactedAt",
  "enrichment", "sharedFromId", "createdAt", "updatedAt", "emails", "calls",
  "socialMessages", "segments", "pipelineEntries", "activities",
  "breakupDrafts", "variantSends", "emailThreads", "emailMessages",
  "calendarEvents", "calendarAttendees", "fieldValues", "agentTasks",
];

const ENTITY_COLUMNS = [
  "id", "userId", "name", "domain", "website", "logoUrl", "phone", "industry",
  "location", "lat", "lng", "geocodedAt", "description", "size", "status",
  "source", "tags", "notes", "enrichment", "sharedFromId", "createdAt",
  "updatedAt", "contacts", "activities", "emailThreads", "calendarEvents",
  "fieldValues", "agentTasks",
];

const PIPELINE_ENTRY_COLUMNS = [
  "id", "userId", "pipelineId", "contactId", "stage", "dealScore",
  "conversationStatus", "lastActivityAt", "amount", "currency", "baseAmount",
  "baseCurrency", "fxRate", "fxRateAt", "expectedCloseDate", "fieldValues",
  "createdAt", "updatedAt",
];

// camelCase -> snake_case, so `lastContactedAt` also reserves the key an
// operator would naturally type ("Last contacted at" -> last_contacted_at).
function camelToSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function reservedSet(columns: string[]): ReadonlySet<string> {
  const set = new Set<string>();
  for (const c of columns) {
    const snake = camelToSnake(c);
    set.add(snake);
    // Also reserve the run-together form, which is what our own normaliser
    // produces from a label typed without spaces ("lastcontactedat").
    set.add(snake.replace(/_/g, ""));
  }
  return set;
}

export const RESERVED_KEYS: Record<FieldEntityName, ReadonlySet<string>> = {
  CONTACT: reservedSet(CONTACT_COLUMNS),
  ENTITY: reservedSet(ENTITY_COLUMNS),
  PIPELINE_ENTRY: reservedSet(PIPELINE_ENTRY_COLUMNS),
};

/**
 * Normalise an operator-typed key or label into the stable snake_case
 * identifier agents address the field by. Throws OpError 400 when the input
 * cannot become a usable identifier, rather than quietly inventing one.
 */
export function normalizeFieldKey(raw: string): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) throw new OpError("Field key is required", 400);

  const key = trimmed
    // Strip accents so "Región" and "Region" are the same key, not two.
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!key) {
    throw new OpError(`"${trimmed}" has no letters or digits to build a field key from`, 400);
  }
  if (!/^[a-z]/.test(key)) {
    throw new OpError(
      `Field key must start with a letter (got "${key}"). Try naming it "revenue_2024" rather than "2024 revenue".`,
      400,
    );
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new OpError(`Field key is too long (max ${MAX_KEY_LENGTH} characters)`, 400);
  }
  return key;
}

/** True when `key` (already normalised) collides with a built-in column. */
export function isReservedFieldKey(entity: FieldEntityName, key: string): boolean {
  return RESERVED_KEYS[entity].has(key);
}

function assertUsableKey(entity: FieldEntityName, raw: string): string {
  const key = normalizeFieldKey(raw);
  if (isReservedFieldKey(entity, key)) {
    throw new OpError(
      `"${key}" is a built-in ${entity.toLowerCase()} column, so a custom field cannot use it. Pick a different name.`,
      400,
    );
  }
  return key;
}

/* ------------------------- Value type routing ------------------------- */

/** The five typed columns of a FieldValue row, all present on every write. */
export interface FieldValueColumns {
  text: string | null;
  number: string | null;
  date: Date | null;
  bool: boolean | null;
  optionId: string | null;
}

const EMPTY_COLUMNS: FieldValueColumns = {
  text: null,
  number: null,
  date: null,
  bool: null,
  optionId: null,
};

export interface OptionLike {
  id: string;
  value: string;
  label: string;
}

export interface DefinitionLike {
  type: FieldTypeName;
  label?: string;
  options?: OptionLike[];
}

function badValue(def: DefinitionLike, detail: string): OpError {
  const name = def.label ? `"${def.label}"` : "this field";
  return new OpError(`${name} is a ${def.type} field: ${detail}`, 400);
}

function asText(def: DefinitionLike, raw: unknown): string | null {
  // Deliberately strict: a number or boolean handed to a TEXT field is almost
  // always the agent filling the wrong field, and coercing it hides that.
  if (typeof raw !== "string") throw badValue(def, "expected a string value");
  const s = raw.trim();
  if (!s) return null;
  const limit = TEXT_LIMITS[def.type] ?? 2000;
  if (s.length > limit) throw badValue(def, `value is too long (max ${limit} characters)`);

  // Shape checks on the typed text kinds. An agent that could not find an
  // address must leave the field empty, not store "not found" in it.
  if (def.type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw badValue(def, `"${s}" is not an email address. Leave it empty if you could not find one.`);
  }
  if (def.type === "URL") {
    let parsed: URL | null = null;
    try {
      parsed = new URL(s);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      throw badValue(def, `"${s}" is not an http or https link. Leave it empty if you could not find one.`);
    }
  }
  if (def.type === "PHONE" && !/\d/.test(s)) {
    throw badValue(def, `"${s}" has no digits, so it is not a phone number`);
  }
  return s;
}

function asNumberString(def: DefinitionLike, raw: unknown): string | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw badValue(def, "value must be a finite number");
    return String(raw);
  }
  if (typeof raw !== "string") throw badValue(def, "expected a number");
  const s = raw.trim().replace(/,/g, "");
  if (!s) return null;
  // Keep the operator's own decimal string rather than round-tripping through
  // a JS float: the column is Decimal(24,4) and can hold more than 2^53.
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw badValue(def, `"${raw}" is not a number`);
  return s;
}

function asDate(def: DefinitionLike, raw: unknown): Date | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) throw badValue(def, "value is not a valid date");
    return raw;
  }
  if (typeof raw !== "string") throw badValue(def, "expected a date string (YYYY-MM-DD or ISO 8601)");
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badValue(def, `"${raw}" is not a valid date`);
  return d;
}

function asBool(def: DefinitionLike, raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  // Agents routinely send booleans as strings over JSON-RPC; accept the two
  // unambiguous spellings and nothing else.
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s === "true" || s === "yes") return true;
    if (s === "false" || s === "no") return false;
  }
  throw badValue(def, "expected true or false");
}

function asOptionId(def: DefinitionLike, raw: unknown): string | null {
  if (typeof raw !== "string") throw badValue(def, "expected one of its option values");
  const s = raw.trim();
  if (!s) return null;
  const options = def.options ?? [];
  const lower = s.toLowerCase();
  const hit =
    options.find((o) => o.value === s) ??
    options.find((o) => o.value.toLowerCase() === lower) ??
    options.find((o) => o.label.toLowerCase() === lower) ??
    options.find((o) => o.id === s);
  if (!hit) {
    // Never invent an option. Silently widening the operator's vocabulary is
    // how a picklist becomes a free-text column nobody can filter on.
    const allowed = options.map((o) => o.value).join(", ") || "(no options defined yet)";
    throw badValue(def, `"${s}" is not one of its options. Allowed: ${allowed}`);
  }
  return hit.id;
}

/**
 * Turn a raw value into the full column set for a FieldValue write. Returns
 * null when the value clears the field (null/undefined/empty), which callers
 * turn into a row delete. Every non-target column is nulled explicitly so a
 * rewrite can never leave a stale value in a mismatched column.
 */
export function buildFieldValueData(
  def: DefinitionLike,
  raw: unknown,
): FieldValueColumns | null {
  requireType(def.type);
  if (raw === null || raw === undefined) return null;

  switch (TYPE_COLUMN[def.type]) {
    case "text": {
      const text = asText(def, raw);
      return text === null ? null : { ...EMPTY_COLUMNS, text };
    }
    case "number": {
      const number = asNumberString(def, raw);
      return number === null ? null : { ...EMPTY_COLUMNS, number };
    }
    case "date": {
      const date = asDate(def, raw);
      return date === null ? null : { ...EMPTY_COLUMNS, date };
    }
    case "bool": {
      const bool = asBool(def, raw);
      return bool === null ? null : { ...EMPTY_COLUMNS, bool };
    }
    case "optionId": {
      const optionId = asOptionId(def, raw);
      return optionId === null ? null : { ...EMPTY_COLUMNS, optionId };
    }
  }
}

/* --------------------------- Row helpers --------------------------- */

// The FieldValue link column for each target entity. Written as a switch (not
// a computed key) so the returned object literal keeps its exact Prisma type.
function recordLink(entity: FieldEntityName, recordId: string) {
  if (entity === "CONTACT") return { contactId: recordId };
  if (entity === "ENTITY") return { entityId: recordId };
  return { pipelineEntryId: recordId };
}

function recordLinkIn(entity: FieldEntityName, recordIds: string[]) {
  if (entity === "CONTACT") return { contactId: { in: recordIds } };
  if (entity === "ENTITY") return { entityId: { in: recordIds } };
  return { pipelineEntryId: { in: recordIds } };
}

function valueUnique(entity: FieldEntityName, fieldId: string, recordId: string) {
  if (entity === "CONTACT") return { fieldId_contactId: { fieldId, contactId: recordId } };
  if (entity === "ENTITY") return { fieldId_entityId: { fieldId, entityId: recordId } };
  return { fieldId_pipelineEntryId: { fieldId, pipelineEntryId: recordId } };
}

/** Assert the target record exists AND belongs to this tenant. */
async function assertRecordOwned(
  userId: string,
  entity: FieldEntityName,
  recordId: string,
): Promise<void> {
  if (!recordId) throw new OpError("recordId is required", 400);
  if (entity === "CONTACT") {
    const row = await prisma.contact.findUnique({
      where: { id: recordId },
      select: { userId: true },
    });
    if (!row || row.userId !== userId) throw new OpError("Contact not found", 404);
    return;
  }
  if (entity === "ENTITY") {
    const row = await prisma.entity.findUnique({
      where: { id: recordId },
      select: { userId: true },
    });
    if (!row || row.userId !== userId) throw new OpError("Entity not found", 404);
    return;
  }
  const row = await prisma.pipelineEntry.findUnique({
    where: { id: recordId },
    select: { userId: true },
  });
  if (!row || row.userId !== userId) throw new OpError("Pipeline entry not found", 404);
}

/* --------------------------- Definitions --------------------------- */

const DEFINITION_INCLUDE = {
  options: { orderBy: { position: "asc" } },
} as const;

export interface FieldDefinitionInput {
  entity: FieldEntityName | string;
  label: string;
  key?: string;
  type: FieldTypeName | string;
  agentFilled?: boolean;
  agentBrief?: string | null;
  required?: boolean;
  showOnSheet?: boolean;
  showOnTable?: boolean;
  position?: number;
  options?: { value?: string; label?: string }[];
}

function cleanLabel(raw: unknown): string {
  const label = typeof raw === "string" ? raw.trim() : "";
  if (!label) throw new OpError("Field label is required", 400);
  if (label.length > MAX_LABEL_LENGTH) {
    throw new OpError(`Field label is too long (max ${MAX_LABEL_LENGTH} characters)`, 400);
  }
  return label;
}

function cleanBrief(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new OpError("agentBrief must be text", 400);
  const brief = raw.trim();
  if (!brief) return null;
  if (brief.length > MAX_BRIEF_LENGTH) {
    throw new OpError(`agentBrief is too long (max ${MAX_BRIEF_LENGTH} characters)`, 400);
  }
  return brief;
}

// Options arrive from the UI as {label, value} pairs where either may be
// missing; normalise to a stable, de-duplicated, positioned list.
function cleanOptions(raw: FieldDefinitionInput["options"]): { label: string; value: string; position: number }[] {
  const list = raw ?? [];
  if (list.length > MAX_OPTIONS_PER_FIELD) {
    throw new OpError(`A select field can have at most ${MAX_OPTIONS_PER_FIELD} options`, 400);
  }
  const seen = new Set<string>();
  const out: { label: string; value: string; position: number }[] = [];
  for (const o of list) {
    const label = (o.label ?? o.value ?? "").trim();
    if (!label) continue;
    if (label.length > MAX_LABEL_LENGTH) {
      throw new OpError(`Option "${label.slice(0, 20)}..." is too long`, 400);
    }
    const value = normalizeFieldKey(o.value?.trim() || label);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ label, value, position: out.length });
  }
  if (!out.length) throw new OpError("A select field needs at least one option", 400);
  return out;
}

export function listFieldDefinitions(
  userId: string,
  entity?: FieldEntityName | string,
  opts: { includeArchived?: boolean } = {},
) {
  return prisma.fieldDefinition.findMany({
    where: {
      userId,
      ...(entity ? { entity: requireEntity(entity) } : {}),
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ entity: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    include: DEFINITION_INCLUDE,
  });
}

export async function getFieldDefinition(userId: string, id: string) {
  const def = await prisma.fieldDefinition.findUnique({
    where: { id },
    include: DEFINITION_INCLUDE,
  });
  // Ownership is checked after the read, never folded into it, so a foreign id
  // and a missing id are indistinguishable to the caller.
  if (!def || def.userId !== userId) throw new OpError("Field not found", 404);
  return def;
}

// Resolve a definition by its agent-facing key. Archived definitions are
// invisible here: an agent must not keep filling a retired field.
async function getDefinitionByKey(userId: string, entity: FieldEntityName, key: string) {
  const def = await prisma.fieldDefinition.findUnique({
    where: { userId_entity_key: { userId, entity, key } },
    include: DEFINITION_INCLUDE,
  });
  if (!def || def.archivedAt) {
    throw new OpError(`No active "${key}" field on ${entity.toLowerCase()} records`, 404);
  }
  return def;
}

async function assertUnderCap(userId: string, entity: FieldEntityName) {
  const count = await prisma.fieldDefinition.count({
    where: { userId, entity, archivedAt: null },
  });
  if (count >= MAX_FIELDS_PER_ENTITY) {
    throw new OpError(
      `You already have ${MAX_FIELDS_PER_ENTITY} custom ${entity.toLowerCase()} fields, the maximum. Archive one before adding another.`,
      400,
    );
  }
}

export async function createFieldDefinition(userId: string, input: FieldDefinitionInput) {
  const entity = requireEntity(input.entity);
  const type = requireType(input.type);
  const label = cleanLabel(input.label);
  const key = assertUsableKey(entity, input.key?.trim() || label);

  await assertUnderCap(userId, entity);

  // The unique index covers archived rows too, so surface the archive rather
  // than letting the operator hit a raw constraint error they can't act on.
  const clash = await prisma.fieldDefinition.findUnique({
    where: { userId_entity_key: { userId, entity, key } },
    select: { id: true, archivedAt: true },
  });
  if (clash) {
    throw new OpError(
      clash.archivedAt
        ? `An archived field already uses the key "${key}". Restore it instead of creating a duplicate.`
        : `A field with the key "${key}" already exists on ${entity.toLowerCase()} records`,
      409,
    );
  }

  const options = type === "SELECT" ? cleanOptions(input.options) : [];

  // Append to the end of the operator's ordering unless they placed it.
  const position =
    typeof input.position === "number" && Number.isFinite(input.position)
      ? Math.trunc(input.position)
      : ((
          await prisma.fieldDefinition.aggregate({
            where: { userId, entity },
            _max: { position: true },
          })
        )._max.position ?? -1) + 1;

  return prisma.fieldDefinition.create({
    data: {
      userId,
      entity,
      key,
      label,
      type,
      agentFilled: input.agentFilled ?? true,
      agentBrief: cleanBrief(input.agentBrief),
      required: input.required ?? false,
      showOnSheet: input.showOnSheet ?? true,
      showOnTable: input.showOnTable ?? false,
      position,
      ...(options.length ? { options: { create: options } } : {}),
    },
    include: DEFINITION_INCLUDE,
  });
}

export interface FieldDefinitionPatch {
  label?: string;
  key?: string;
  type?: FieldTypeName | string;
  agentFilled?: boolean;
  agentBrief?: string | null;
  required?: boolean;
  showOnSheet?: boolean;
  showOnTable?: boolean;
  position?: number;
  options?: { value?: string; label?: string }[];
  /** Bring an archived definition back into use. */
  restore?: boolean;
}

export async function updateFieldDefinition(
  userId: string,
  id: string,
  patch: FieldDefinitionPatch,
) {
  const def = await getFieldDefinition(userId, id);
  const valueCount = await prisma.fieldValue.count({ where: { fieldId: def.id } });

  const data: Prisma.FieldDefinitionUncheckedUpdateInput = {};

  if (patch.label !== undefined) data.label = cleanLabel(patch.label);
  if (patch.agentBrief !== undefined) data.agentBrief = cleanBrief(patch.agentBrief);
  if (patch.agentFilled !== undefined) data.agentFilled = !!patch.agentFilled;
  if (patch.required !== undefined) data.required = !!patch.required;
  if (patch.showOnSheet !== undefined) data.showOnSheet = !!patch.showOnSheet;
  if (patch.showOnTable !== undefined) data.showOnTable = !!patch.showOnTable;
  if (patch.position !== undefined && Number.isFinite(patch.position)) {
    data.position = Math.trunc(patch.position);
  }
  if (patch.restore) data.archivedAt = null;

  // The key is the agent-facing address of this field. Renaming it once values
  // exist orphans every brief, prompt, and export that referenced it, so we
  // only allow it while the field is still empty.
  if (patch.key !== undefined) {
    const key = assertUsableKey(def.entity, patch.key);
    if (key !== def.key) {
      if (valueCount > 0) {
        throw new OpError(
          `"${def.label}" already holds ${valueCount} value${valueCount === 1 ? "" : "s"}, so its key cannot be renamed. Archive it and create a new field instead.`,
          400,
        );
      }
      const clash = await prisma.fieldDefinition.findUnique({
        where: { userId_entity_key: { userId, entity: def.entity, key } },
        select: { id: true },
      });
      if (clash && clash.id !== def.id) {
        throw new OpError(`A field with the key "${key}" already exists`, 409);
      }
      data.key = key;
    }
  }

  // Same reasoning for the type: values already sit in the old type's column,
  // and moving them across columns is a migration, not an edit.
  let nextType = def.type as FieldTypeName;
  if (patch.type !== undefined) {
    nextType = requireType(patch.type);
    if (nextType !== def.type) {
      if (valueCount > 0) {
        throw new OpError(
          `"${def.label}" already holds ${valueCount} value${valueCount === 1 ? "" : "s"}, so its type cannot be changed. Archive it and create a new field instead.`,
          400,
        );
      }
      data.type = nextType;
    }
  }

  if (patch.options !== undefined) {
    if (nextType !== "SELECT") throw new OpError("Only select fields have options", 400);
    await replaceOptions(def.id, cleanOptions(patch.options));
  }

  if (patch.restore) await assertUnderCap(userId, def.entity);

  if (Object.keys(data).length === 0) {
    return getFieldDefinition(userId, id);
  }
  return prisma.fieldDefinition.update({
    where: { id: def.id },
    data,
    include: DEFINITION_INCLUDE,
  });
}

// Options are replaced as a set. An option that is still referenced by a value
// is never dropped silently: FieldValue.option is SetNull, so removing it would
// blank real answers with no trace.
async function replaceOptions(
  fieldId: string,
  next: { label: string; value: string; position: number }[],
) {
  const existing = await prisma.fieldOption.findMany({
    where: { fieldId },
    select: { id: true, value: true },
  });
  const keep = new Set(next.map((o) => o.value));
  const removed = existing.filter((o) => !keep.has(o.value));

  if (removed.length) {
    const inUse = await prisma.fieldValue.count({
      where: { optionId: { in: removed.map((o) => o.id) } },
    });
    if (inUse > 0) {
      throw new OpError(
        `Cannot remove option${removed.length === 1 ? "" : "s"} "${removed.map((o) => o.value).join(", ")}": ${inUse} record${inUse === 1 ? " is" : "s are"} still set to ${removed.length === 1 ? "it" : "them"}.`,
        400,
      );
    }
    await prisma.fieldOption.deleteMany({ where: { id: { in: removed.map((o) => o.id) } } });
  }

  const byValue = new Map(existing.map((o) => [o.value, o.id]));
  for (const o of next) {
    const id = byValue.get(o.value);
    if (id) {
      await prisma.fieldOption.update({
        where: { id },
        data: { label: o.label, position: o.position },
      });
    } else {
      await prisma.fieldOption.create({
        data: { fieldId, label: o.label, value: o.value, position: o.position },
      });
    }
  }
}

/**
 * Retire a definition. If it holds any values it is ARCHIVED (archivedAt set)
 * so the history survives and can be restored; only a definition that never
 * held a value is hard-deleted. Returns which of the two happened.
 */
export async function deleteFieldDefinition(userId: string, id: string) {
  const def = await getFieldDefinition(userId, id);
  const valueCount = await prisma.fieldValue.count({ where: { fieldId: def.id } });

  if (valueCount > 0) {
    const archived = await prisma.fieldDefinition.update({
      where: { id: def.id },
      data: { archivedAt: new Date() },
      include: DEFINITION_INCLUDE,
    });
    return { archived: true, deleted: false, valueCount, definition: archived };
  }

  await prisma.fieldDefinition.delete({ where: { id: def.id } });
  return { archived: false, deleted: true, valueCount: 0, definition: null };
}

/* ------------------------------ Values ------------------------------ */

export interface ShapedFieldValue {
  fieldId: string;
  key: string;
  label: string;
  type: FieldTypeName;
  /** The typed value: string, number, boolean, ISO date string, or null. */
  value: string | number | boolean | null;
  /** For SELECT, the chosen option's stable value (and its id). */
  optionId: string | null;
  /** Human-readable rendering, safe to print in a UI or an agent transcript. */
  display: string;
  updatedAt: Date | null;
}

interface ValueRow {
  fieldId: string;
  text: string | null;
  number: unknown;
  date: Date | null;
  bool: boolean | null;
  optionId: string | null;
  option?: { id: string; value: string; label: string } | null;
  updatedAt?: Date | null;
}

interface DefRow {
  id: string;
  key: string;
  label: string;
  type: string;
}

// Read the ONE column this field's type owns. Reading by type (never "first
// non-null column") means a row left over from an older shape can't leak a
// value the definition no longer claims.
function shapeValue(def: DefRow, row: ValueRow | undefined): ShapedFieldValue {
  const type = def.type as FieldTypeName;
  const base = {
    fieldId: def.id,
    key: def.key,
    label: def.label,
    type,
    optionId: null as string | null,
    updatedAt: row?.updatedAt ?? null,
  };
  if (!row) return { ...base, value: null, display: "" };

  switch (TYPE_COLUMN[type]) {
    case "text":
      return { ...base, value: row.text, display: row.text ?? "" };
    case "number": {
      // Prisma returns Decimal; Number() is the shape both the UI inputs and
      // an agent's JSON expect.
      const n = row.number === null || row.number === undefined ? null : Number(row.number);
      return { ...base, value: n, display: n === null ? "" : String(n) };
    }
    case "date": {
      const iso = row.date ? row.date.toISOString() : null;
      return { ...base, value: iso, display: iso ? iso.slice(0, 10) : "" };
    }
    case "bool":
      return {
        ...base,
        value: row.bool,
        display: row.bool === null ? "" : row.bool ? "Yes" : "No",
      };
    case "optionId":
      return {
        ...base,
        value: row.option?.value ?? null,
        optionId: row.optionId,
        display: row.option?.label ?? "",
      };
  }
}

const VALUE_INCLUDE = {
  option: { select: { id: true, value: true, label: true } },
} as const;

/**
 * Every custom field on one record, definitions included, so an empty field is
 * still visible (an agent needs to see the question to answer it).
 */
export async function getFieldValues(
  userId: string,
  entity: FieldEntityName | string,
  recordId: string,
) {
  const ent = requireEntity(entity);
  await assertRecordOwned(userId, ent, recordId);

  const defs = await listFieldDefinitions(userId, ent);
  const rows = await prisma.fieldValue.findMany({
    where: { userId, ...recordLink(ent, recordId) },
    include: VALUE_INCLUDE,
  });
  const byField = new Map(rows.map((r) => [r.fieldId, r as ValueRow]));

  return {
    entity: ent,
    recordId,
    fields: defs.map((d) => ({
      ...shapeValue(d, byField.get(d.id)),
      required: d.required,
      agentFilled: d.agentFilled,
      agentBrief: d.agentBrief,
      options: d.options.map((o) => ({ value: o.value, label: o.label })),
    })),
  };
}

/**
 * Bulk read for a list view or an agent batch: all custom values for many
 * records in ONE value query (plus one definitions query), never N+1.
 */
export async function getFieldValuesForRecords(
  userId: string,
  entity: FieldEntityName | string,
  recordIds: string[],
) {
  const ent = requireEntity(entity);
  const ids = Array.from(new Set((recordIds ?? []).filter(Boolean))).slice(0, 500);

  const definitions = await listFieldDefinitions(userId, ent);
  const byRecord: Record<string, Record<string, ShapedFieldValue>> = {};
  for (const id of ids) byRecord[id] = {};
  if (!ids.length || !definitions.length) return { entity: ent, definitions, byRecord };

  const rows = await prisma.fieldValue.findMany({
    // userId scoping here is the tenant boundary; the record ids alone are not
    // trusted, since an id from another tenant would otherwise read through.
    where: { userId, ...recordLinkIn(ent, ids), field: { entity: ent, archivedAt: null } },
    include: VALUE_INCLUDE,
  });

  const defById = new Map(definitions.map((d) => [d.id, d]));
  for (const row of rows) {
    const def = defById.get(row.fieldId);
    if (!def) continue;
    const recordId = row.contactId ?? row.entityId ?? row.pipelineEntryId;
    if (!recordId || !byRecord[recordId]) continue;
    byRecord[recordId][def.key] = shapeValue(def, row as ValueRow);
  }

  return { entity: ent, definitions, byRecord };
}

/**
 * Write one custom value. Validates that the value matches the definition's
 * type, that a SELECT resolves to a real option of THAT definition, and that
 * both the definition and the record belong to this tenant. Passing null (or
 * an empty string) clears the field, which is the honest answer when the agent
 * could not verify anything: an empty field beats a wrong one.
 */
export async function setFieldValue(
  userId: string,
  entity: FieldEntityName | string,
  recordId: string,
  key: string,
  value: unknown,
) {
  const ent = requireEntity(entity);
  const def = await getDefinitionByKey(userId, ent, normalizeFieldKey(key));
  await assertRecordOwned(userId, ent, recordId);

  const data = buildFieldValueData(
    { type: def.type as FieldTypeName, label: def.label, options: def.options },
    value,
  );

  if (!data) {
    await prisma.fieldValue.deleteMany({
      where: { userId, fieldId: def.id, ...recordLink(ent, recordId) },
    });
    return { ...shapeValue(def, undefined), cleared: true };
  }

  const row = await prisma.fieldValue.upsert({
    where: valueUnique(ent, def.id, recordId),
    create: { userId, fieldId: def.id, ...recordLink(ent, recordId), ...data },
    update: data,
    include: VALUE_INCLUDE,
  });

  return { ...shapeValue(def, row as ValueRow), cleared: false };
}

/**
 * The agent's work queue for one record: which agent-fillable fields are still
 * empty, and what the operator wrote about each. This is what lets an agent go
 * do the research unprompted instead of waiting to be told.
 */
export async function listUnfilledFields(
  userId: string,
  entity: FieldEntityName | string,
  recordId: string,
) {
  const ent = requireEntity(entity);
  await assertRecordOwned(userId, ent, recordId);

  const defs = await prisma.fieldDefinition.findMany({
    where: { userId, entity: ent, archivedAt: null, agentFilled: true },
    orderBy: [{ required: "desc" }, { position: "asc" }],
    include: DEFINITION_INCLUDE,
  });
  if (!defs.length) return { entity: ent, recordId, unfilled: [] };

  const rows = await prisma.fieldValue.findMany({
    where: { userId, ...recordLink(ent, recordId), fieldId: { in: defs.map((d) => d.id) } },
    include: VALUE_INCLUDE,
  });
  const byField = new Map(rows.map((r) => [r.fieldId, r as ValueRow]));

  const unfilled = defs
    .filter((d) => shapeValue(d, byField.get(d.id)).value === null)
    .map((d) => ({
      key: d.key,
      label: d.label,
      type: d.type,
      required: d.required,
      // The brief is the whole product: it is the operator's own words about
      // what belongs here and where to look.
      agentBrief: d.agentBrief,
      options: d.options.map((o) => ({ value: o.value, label: o.label })),
    }));

  return { entity: ent, recordId, unfilled };
}
