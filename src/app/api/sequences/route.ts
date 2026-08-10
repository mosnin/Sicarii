// Sequences: list + create. Clerk-session authed, userId-scoped.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import { createSequence, listSequences } from "@/lib/sequences";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  steps: z
    .array(z.object({ delayDays: z.number().int().min(0).max(365), subject: z.string().min(1).max(300), body: z.string().min(1).max(20000) }))
    .min(1)
    .max(20),
});

function fail(e: unknown, verb: string): NextResponse {
  if (e instanceof NextResponse) return e;
  if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[sequences] ${verb}`, e);
  return NextResponse.json({ error: `Failed to ${verb} sequence` }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    return NextResponse.json({ sequences: await listSequences(user.id) });
  } catch (e) {
    return fail(e, "list");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const input = schema.parse(await req.json());
    return NextResponse.json({ sequence: await createSequence(user.id, input) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 });
    return fail(e, "create");
  }
}
