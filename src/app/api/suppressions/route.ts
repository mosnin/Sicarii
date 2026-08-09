// Operator-facing suppression management. Clerk-session authed and userId-scoped
// like every other CRM route. This is the surface the acceptable-use promise
// ("honor opt-outs and deletion requests") needs and previously lacked: a place
// to see, add, and remove the opt-out ledger.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import { addSuppression, removeSuppression, listSuppressions } from "@/lib/suppression";

export const runtime = "nodejs";

const addSchema = z.object({
  email: z.string().trim().max(320).optional(),
  domain: z.string().trim().max(253).optional(),
  scope: z.enum(["INBOUND", "OUTBOUND", "ALL"]).optional(),
  reason: z.string().trim().max(500).optional(),
});

function handle(e: unknown, verb: string): NextResponse {
  if (e instanceof NextResponse) return e;
  if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[suppressions] ${verb}`, e);
  return NextResponse.json({ error: `Failed to ${verb} suppression` }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    return NextResponse.json({ suppressions: await listSuppressions(user.id) });
  } catch (e) {
    return handle(e, "list");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const input = addSchema.parse(await req.json());
    return NextResponse.json({ suppression: await addSuppression(user.id, input) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 });
    return handle(e, "add");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const url = new URL(req.url);
    const removed = await removeSuppression(user.id, {
      email: url.searchParams.get("email"),
      domain: url.searchParams.get("domain"),
    });
    return NextResponse.json(removed);
  } catch (e) {
    return handle(e, "remove");
  }
}
