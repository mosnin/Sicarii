import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError, deleteImportedBySource } from "@/lib/crm-operations";

// POST /api/cleanup/imported  body: { sources?: string[] }
// Bulk-deletes the authenticated user's entities + contacts that came from the
// given auto-import sources. Scoped to the caller's own records only.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const body = (await req.json().catch(() => null)) as { sources?: unknown } | null;
    const result = await deleteImportedBySource(user.id, body?.sources);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/cleanup/imported", e);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
