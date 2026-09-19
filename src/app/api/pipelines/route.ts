import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { createPipeline, listPipelines } from "@/lib/field-operations";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const pipelines = await listPipelines(user.id);
    return NextResponse.json({ pipelines });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to list pipelines" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(2000).optional(),
  segmentId: z.string().uuid().optional(), // seed entries from a segment
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`pipelines-create:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid pipeline" }, { status: 400 });
    const { name, goal, segmentId } = parsed.data;
    const pipeline = await createPipeline(user.id, { name, goal, segmentId });

    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/pipelines", e);
    return NextResponse.json({ error: "Failed to create pipeline" }, { status: 500 });
  }
}
