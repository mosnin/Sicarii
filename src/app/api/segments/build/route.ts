import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { buildSmartSegment } from "@/lib/field-operations";

export const maxDuration = 60;

const schema = z.object({
  goal: z.string().trim().min(3).max(2000),
  quantity: z.number().int().min(1).max(100).optional(),
  name: z.string().trim().max(120).optional(),
});

// POST /api/segments/build - build a segment from a prompt. Vector-matches the
// closest ELIGIBLE prospects (enriched + not yet contacted + not in a pipeline).
// Goes through the shared buildSmartSegment (lib/field-operations.ts) so this
// dashboard route and the MCP build_smart_segment tool behave identically,
// including credit metering: buildSmartSegment gates on CREDIT_COSTS.build_segment
// before the OpenAI embedding call and debits only after a segment is built.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`segment-build:${user.id}`, 8, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Describe the segment goal." }, { status: 400 });
    const { goal, quantity, name } = parsed.data;

    const result = await buildSmartSegment(user.id, { goal, quantity, name });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/segments/build", e);
    return NextResponse.json({ error: "Segment build failed" }, { status: 500 });
  }
}
