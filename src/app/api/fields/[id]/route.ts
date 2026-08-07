import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import {
  FIELD_TYPES,
  MAX_BRIEF_LENGTH,
  MAX_KEY_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_OPTIONS_PER_FIELD,
  getFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
} from "@/lib/fields";

const optionSchema = z.object({
  value: z.string().trim().max(MAX_LABEL_LENGTH).optional(),
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
});

const patchSchema = z.object({
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH).optional(),
  key: z.string().trim().max(MAX_KEY_LENGTH).optional(),
  type: z.enum(FIELD_TYPES).optional(),
  agentFilled: z.boolean().optional(),
  agentBrief: z.string().max(MAX_BRIEF_LENGTH).nullable().optional(),
  required: z.boolean().optional(),
  showOnSheet: z.boolean().optional(),
  showOnTable: z.boolean().optional(),
  position: z.number().int().min(0).max(999).optional(),
  options: z.array(optionSchema).max(MAX_OPTIONS_PER_FIELD).optional(),
  restore: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const field = await getFieldDefinition(user.id, id);
    return NextResponse.json({ field });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/fields/[id]", e);
    return NextResponse.json({ error: "Failed to load field" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid update", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const field = await updateFieldDefinition(user.id, id, parsed.data);
    return NextResponse.json({ field });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/fields/[id]", e);
    return NextResponse.json({ error: "Failed to update field" }, { status: 500 });
  }
}

// DELETE /api/fields/[id] - retire a field. A definition that holds values is
// ARCHIVED so the answers survive; only a never-filled one is really deleted.
// The response says which happened so the UI can tell the truth about it.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const result = await deleteFieldDefinition(user.id, id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/fields/[id]", e);
    return NextResponse.json({ error: "Failed to remove field" }, { status: 500 });
  }
}
