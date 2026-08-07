import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { listProposedFacts } from "@/lib/facts";
import type { FactRecordType } from "@prisma/client";

// GET /api/facts - the suggestions queue: facts the evidence ledger held back
// for a human, oldest first. Human-session only (getAuthenticatedUser resolves
// a Clerk session, never an agent API key) - agents read the same list over
// MCP via list_proposed_facts, but only a person can act on it.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(req.url);

    const rawType = searchParams.get("recordType");
    const recordType =
      rawType === "CONTACT" || rawType === "ENTITY" ? (rawType as FactRecordType) : undefined;
    const rawLimit = Number(searchParams.get("limit"));

    const facts = await listProposedFacts(user.id, {
      recordType,
      recordId: searchParams.get("recordId") ?? undefined,
      limit: Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined,
    });
    return NextResponse.json({ facts });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/facts", e);
    return NextResponse.json({ error: "Failed to load suggestions" }, { status: 500 });
  }
}
