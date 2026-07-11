import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { shareContactToWorkspace } from "@/lib/share";

const shareSchema = z.object({
  workspaceId: z.string().uuid(),
  includeMessages: z.boolean().optional(),
});

// POST /api/contacts/[id]/share - deep-copy a PERSONAL contact into a team
// workspace the caller belongs to. Always operates from the personal account
// (ctx.actor), regardless of the active org context, because the contact being
// shared lives there; membership in the target workspace is asserted inside
// the share op.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;
    const rate = await checkRateLimit(`share:${ctx.actor.id}`, 30, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const parsed = shareSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = await shareContactToWorkspace({
      actorUserId: ctx.actor.id,
      actorName: [ctx.actor.firstName, ctx.actor.lastName].filter(Boolean).join(" ") || null,
      workspaceId: parsed.data.workspaceId,
      contactId: id,
      includeMessages: parsed.data.includeMessages,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/contacts/[id]/share", e);
    return NextResponse.json({ error: "Failed to share contact" }, { status: 500 });
  }
}
