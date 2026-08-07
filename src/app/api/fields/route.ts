import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import {
  FIELD_ENTITIES,
  FIELD_TYPES,
  MAX_BRIEF_LENGTH,
  MAX_KEY_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_OPTIONS_PER_FIELD,
  listFieldDefinitions,
  createFieldDefinition,
} from "@/lib/fields";

// GET /api/fields?entity=CONTACT&includeArchived=1 - the custom field
// definitions this account has declared, in the operator's own ordering.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const entity = searchParams.get("entity")?.trim() || undefined;
    const includeArchived = searchParams.get("includeArchived") === "1";

    const fields = await listFieldDefinitions(user.id, entity, { includeArchived });
    return NextResponse.json({ fields });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/fields", e);
    return NextResponse.json({ error: "Failed to list fields" }, { status: 500 });
  }
}

const optionSchema = z.object({
  value: z.string().trim().max(MAX_LABEL_LENGTH).optional(),
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
});

const createSchema = z.object({
  entity: z.enum(FIELD_ENTITIES),
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
  key: z.string().trim().max(MAX_KEY_LENGTH).optional(),
  type: z.enum(FIELD_TYPES),
  agentFilled: z.boolean().optional(),
  agentBrief: z.string().max(MAX_BRIEF_LENGTH).nullable().optional(),
  required: z.boolean().optional(),
  showOnSheet: z.boolean().optional(),
  showOnTable: z.boolean().optional(),
  position: z.number().int().min(0).max(999).optional(),
  options: z.array(optionSchema).max(MAX_OPTIONS_PER_FIELD).optional(),
});

// POST /api/fields - declare a new custom field on a record type.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`fields:create:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid field", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const field = await createFieldDefinition(user.id, parsed.data);
    return NextResponse.json({ field }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/fields", e);
    return NextResponse.json({ error: "Failed to create field" }, { status: 500 });
  }
}
