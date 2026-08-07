import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { dismissFact } from "@/lib/facts";

// POST /api/facts/[id]/dismiss - reject a suggestion. The record is never
// touched. Human-session only, same reasoning as apply/route.ts.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { account, actor } = await getAuthContext();
    const { id } = await params;

    const rate = await checkRateLimit(`fact-dismiss:${account.id}`, 60, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const fact = await dismissFact(account.id, id, actor.id);
    return NextResponse.json({ fact });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/facts/[id]/dismiss", e);
    return NextResponse.json({ error: "Failed to dismiss suggestion" }, { status: 500 });
  }
}
