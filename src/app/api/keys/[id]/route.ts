import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-utils";

// DELETE /api/keys/[id] - revoke a key (soft delete; keeps it auditable).
// In a team workspace this is admin-only, matching POST /api/keys: a member
// must not be able to disable every connected agent by revoking a key they
// were never allowed to mint.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (ctx.workspaceRole === "member") {
      return NextResponse.json(
        { error: "Only a team admin can revoke workspace API keys." },
        { status: 403 },
      );
    }
    const user = ctx.account;
    const { id } = await params;
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("DELETE /api/keys/[id]", e);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
