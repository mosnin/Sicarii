// MCP tools for user-defined fields. Registered onto the shared MCP server by
// src/app/api/mcp/[transport]/route.ts, which owns auth, credits, and the
// run/gated wrappers and passes them in as `ctx` so this module never
// re-derives a tenant id or an error shape of its own.
//
// The point of these five tools: the operator defines a field in the UI and
// writes, in plain prose, what it means and where to look (`agentBrief`). The
// agent reads that brief here and fills the field itself. No code change from
// us, ever. So every read tool ships the brief, and list_unfilled_fields is the
// work queue that lets an agent act without being asked.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  OpError,
  FIELD_ENTITIES,
  FIELD_TYPES,
  listFieldDefinitions,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  getFieldDefinition,
  getFieldValues,
  setFieldValue,
  listUnfilledFields,
} from "@/lib/fields";

/** The request extra the MCP SDK hands a tool handler. */
type McpExtra = { authInfo?: AuthInfo };

/** The tool-result envelope the MCP route builds (text content, optional error). */
type FieldsToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/**
 * What the MCP route lends us: the authenticated tenant id, the OpError-aware
 * body wrapper, and the rate-limited variant for writes. Declared structurally
 * so this module has no import back into the route.
 */
export interface FieldsToolContext {
  /** Tenant id from the authenticated session; throws 401 when absent. */
  userIdFrom: (extra: McpExtra) => string;
  /** Run a read, turning OpError into a clean tool error. */
  run: (fn: () => Promise<unknown>) => Promise<FieldsToolResult>;
  /** Run a write behind a per-user, per-bucket rate limit. */
  gated: (
    extra: McpExtra,
    bucket: string,
    limit: number,
    fn: (userId: string) => Promise<unknown>,
  ) => Promise<FieldsToolResult>;
}

// The one rule every one of these descriptions has to carry. Custom fields are
// read as fact by the operator, so a guess here is worse than a blank.
const ACCURACY_RULE =
  "ACCURACY RULE: fill a field only from something you actually observed (a page you read, a document you were given, a reply you received). If you could not verify it for THIS exact record, leave it empty and say you could not find it. A wrong value is far worse than an empty one, and never carry a value over from a same-name person or a different company.";

const entityArg = z
  .enum(FIELD_ENTITIES)
  .describe("Which record type the field lives on: CONTACT (a person), ENTITY (a company), or PIPELINE_ENTRY (a deal).");

export function registerFieldsTools(server: McpServer, ctx: FieldsToolContext): void {
  /* ------------------------------ Read ------------------------------ */

  server.tool(
    "list_fields",
    `List the operator's custom fields for a record type, including each field's agentBrief: the operator's own prose saying what the field means and how to find it. Read the brief before filling anything; it is the spec for that field. Returns key (the identifier you pass to set_field_value), label, type, whether you are allowed to fill it (agentFilled), whether it is required, and the allowed options for SELECT fields. ${ACCURACY_RULE}`,
    {
      entity: entityArg,
      includeArchived: z
        .boolean()
        .optional()
        .describe("Include retired fields. Archived fields are read-only history; do not fill them."),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ entity, includeArchived }, extra) =>
      ctx.run(() =>
        listFieldDefinitions(ctx.userIdFrom(extra), entity, {
          includeArchived: includeArchived ?? false,
        }),
      ),
  );

  server.tool(
    "get_field_values",
    "Read every custom field on one record, filled or not. Each entry carries the field's key, label, type, current value (null when empty), and the operator's agentBrief. Use this before writing so you do not overwrite an answer someone already verified.",
    {
      entity: entityArg,
      recordId: z.string().describe("The contact, entity, or pipeline entry id."),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ entity, recordId }, extra) =>
      ctx.run(() => getFieldValues(ctx.userIdFrom(extra), entity, recordId)),
  );

  server.tool(
    "list_unfilled_fields",
    `Your work queue for one record: the custom fields the operator marked agent-fillable that are still empty, each with the agentBrief describing what belongs there and where to look. Required fields come first. Use this to decide what research to do on a record without being asked, then write results back with set_field_value. ${ACCURACY_RULE} It is a correct and expected outcome to leave a field on this list because the answer could not be verified.`,
    {
      entity: entityArg,
      recordId: z.string().describe("The contact, entity, or pipeline entry id."),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ entity, recordId }, extra) =>
      ctx.run(() => listUnfilledFields(ctx.userIdFrom(extra), entity, recordId)),
  );

  /* ------------------------------ Write ------------------------------ */

  server.tool(
    "set_field_value",
    `Write one custom field on one record. The value must match the field's type, which you can read from list_fields: TEXT/LONG_TEXT/URL/EMAIL/PHONE take a string, NUMBER takes a number, DATE takes YYYY-MM-DD or an ISO 8601 timestamp, CHECKBOX takes true or false, and SELECT takes one of that field's defined option values (a value that is not one of them is rejected, not added). A mismatched type is rejected rather than coerced. Pass value: null (or an empty string) to clear the field, which is the right call when a value turns out to be wrong or unverifiable. ${ACCURACY_RULE}`,
    {
      entity: entityArg,
      recordId: z.string().describe("The contact, entity, or pipeline entry id."),
      key: z
        .string()
        .max(64)
        .describe("The field's key from list_fields (snake_case, e.g. compliance_framework)."),
      value: z
        .union([z.string().max(20000), z.number(), z.boolean(), z.null()])
        .describe("The value to store, typed to match the field. null clears it."),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ entity, recordId, key, value }, extra) =>
      ctx.gated(extra, "set_field_value", 300, (userId) =>
        setFieldValue(userId, entity, recordId, key, value),
      ),
  );

  server.tool(
    "manage_fields",
    `CHANGES THE OPERATOR'S SCHEMA. Create, update, or archive a custom field DEFINITION, which affects every record of that type, not one record. Do this only when the operator asked for a new field in so many words, or when a field you were told to fill plainly does not exist yet; otherwise use set_field_value on the fields that already exist. When you create a field, write an agentBrief in the operator's terms saying what belongs in it and where to look, because that brief is what you and every future agent will read. action "create" needs entity, label and type (plus options for SELECT). action "update" needs id and the properties to change; a field's key and type are locked once it holds values, so archive it and create a new one instead. action "archive" retires a field: its existing values are kept and stay readable, and nothing is deleted while any value exists.`,
    {
      action: z.enum(["create", "update", "archive"]),
      id: z.string().optional().describe("Field definition id. Required for update and archive."),
      entity: z
        .enum(FIELD_ENTITIES)
        .optional()
        .describe("Required for create: which record type the field lives on."),
      label: z.string().max(80).optional().describe("What a human sees, e.g. \"Compliance framework\"."),
      key: z
        .string()
        .max(64)
        .optional()
        .describe("Optional identifier; derived from the label when omitted. Normalised to snake_case, and rejected if it collides with a built-in column such as name or email."),
      type: z.enum(FIELD_TYPES).optional().describe("Required for create."),
      agentFilled: z.boolean().optional().describe("Whether an agent may fill this field. Default true."),
      agentBrief: z
        .string()
        .max(4000)
        .optional()
        .describe("Plain prose telling an agent what belongs in this field and how to find it. This is the field's real specification; write it carefully."),
      required: z.boolean().optional(),
      showOnSheet: z.boolean().optional().describe("Show on the record detail sheet."),
      showOnTable: z.boolean().optional().describe("Show as a column in list views."),
      position: z.number().int().min(0).max(999).optional(),
      options: z
        .array(z.object({ value: z.string().max(80).optional(), label: z.string().max(80) }))
        .max(100)
        .optional()
        .describe("The allowed choices for a SELECT field. Sending this replaces the whole set; an option still in use by a record cannot be removed."),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async (args, extra) =>
      ctx.gated(extra, "manage_fields", 30, async (userId) => {
        if (args.action === "create") {
          if (!args.entity || !args.label || !args.type) {
            throw new OpError("create needs entity, label and type");
          }
          return createFieldDefinition(userId, {
            entity: args.entity,
            label: args.label,
            key: args.key,
            type: args.type,
            agentFilled: args.agentFilled,
            agentBrief: args.agentBrief,
            required: args.required,
            showOnSheet: args.showOnSheet,
            showOnTable: args.showOnTable,
            position: args.position,
            options: args.options,
          });
        }
        if (!args.id) throw new OpError(`${args.action} needs the field's id`);
        if (args.action === "archive") {
          // Ownership is asserted inside deleteFieldDefinition; the extra read
          // here is only so the reply can name what was retired.
          const def = await getFieldDefinition(userId, args.id);
          const result = await deleteFieldDefinition(userId, args.id);
          return { ...result, key: def.key, label: def.label };
        }
        return updateFieldDefinition(userId, args.id, {
          label: args.label,
          key: args.key,
          type: args.type,
          agentFilled: args.agentFilled,
          agentBrief: args.agentBrief,
          required: args.required,
          showOnSheet: args.showOnSheet,
          showOnTable: args.showOnTable,
          position: args.position,
          options: args.options,
        });
      }),
  );
}
