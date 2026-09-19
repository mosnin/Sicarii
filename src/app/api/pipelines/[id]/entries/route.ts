import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/crm-operations";
import { addToPipeline, updatePipelineEntry } from "@/lib/field-operations";

const STAGES = ["NEW", "ENRICHED", "PROSPECTING", "ENGAGING", "REPLYING", "WON", "LOST"] as const;
const CONVO = ["OPEN", "AWAITING_REPLY", "STALLED", "CLOSED"] as const;

const addSchema = z.object({
  contactIds: z.array(z.string().uuid()).max(500).optional(),
  segmentId: z.string().uuid().optional(),
});

// POST - add contacts (or a whole segment) to the pipeline as NEW entries.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const result = await addToPipeline(user.id, id, parsed.data);
    return NextResponse.json({ added: result.added, ...(result.truncated ? { truncated: true, cap: 500 } : {}) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST pipeline entries", e);
    return NextResponse.json({ error: "Failed to add entries" }, { status: 500 });
  }
}

const patchSchema = z.object({
  entryId: z.string().uuid(),
  stage: z.enum(STAGES).optional(),
  dealScore: z.number().int().min(0).max(100).nullable().optional(),
  conversationStatus: z.enum(CONVO).optional(),
});

// PATCH - update one entry's stage / deal score / conversation status.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    const { entryId, ...rest } = parsed.data;
    const updated = await updatePipelineEntry(user.id, id, entryId, rest);
    return NextResponse.json({ entry: updated });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH pipeline entries", e);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}
