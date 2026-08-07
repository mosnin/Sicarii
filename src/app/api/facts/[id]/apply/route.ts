import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { applyFact } from "@/lib/facts";

// POST /api/facts/[id]/apply - promote a suggestion onto the record.
// Deliberately human-session ONLY: getAuthContext resolves a Clerk session,
// never an agent API key, so an agent can never apply its own proposed fact.
// That is the whole reason the suggestion queue exists. Scoping uses the
// account (the workspace row in team context); decidedById is the human.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { account, actor } = await getAuthContext();
    const { id } = await params;

    const rate = await checkRateLimit(`fact-apply:${account.id}`, 60, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const fact = await applyFact(account.id, id, actor.id);
    return NextResponse.json({ fact });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/facts/[id]/apply", e);
    return NextResponse.json({ error: "Failed to apply suggestion" }, { status: 500 });
  }
}
