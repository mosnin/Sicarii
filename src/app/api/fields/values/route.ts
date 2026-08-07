import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import {
  FIELD_ENTITIES,
  MAX_KEY_LENGTH,
  getFieldValues,
  getFieldValuesForRecords,
  setFieldValue,
} from "@/lib/fields";

// GET /api/fields/values?entity=CONTACT&recordId=...            - one record
// GET /api/fields/values?entity=CONTACT&recordIds=a,b,c          - many records
//
// The bulk form is what a list view uses: one value query for every row on
// screen, never one per row.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const entity = searchParams.get("entity")?.trim() ?? "";
    const recordId = searchParams.get("recordId")?.trim();
    const recordIds = searchParams.get("recordIds")?.trim();

    if (recordId) {
      return NextResponse.json(await getFieldValues(user.id, entity, recordId));
    }
    const ids = (recordIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ error: "Provide recordId or recordIds" }, { status: 400 });
    }
    return NextResponse.json(await getFieldValuesForRecords(user.id, entity, ids));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/fields/values", e);
    return NextResponse.json({ error: "Failed to load field values" }, { status: 500 });
  }
}

const setSchema = z.object({
  entity: z.enum(FIELD_ENTITIES),
  recordId: z.string().min(1),
  key: z.string().trim().min(1).max(MAX_KEY_LENGTH),
  // null clears the field, which is the honest state when nothing could be
  // verified. The ops layer rejects anything that does not match the type.
  value: z.union([z.string().max(20000), z.number(), z.boolean(), z.null()]),
});

// POST /api/fields/values - write (or clear) one custom value on one record.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`fields:set:${user.id}`, 300, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = setSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid value", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { entity, recordId, key, value } = parsed.data;
    const field = await setFieldValue(user.id, entity, recordId, key, value);
    return NextResponse.json({ field });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/fields/values", e);
    return NextResponse.json({ error: "Failed to save field value" }, { status: 500 });
  }
}
