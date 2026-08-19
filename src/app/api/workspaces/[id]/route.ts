import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-utils";
import { deleteNativeWorkspace, renameWorkspace, WORKSPACE_COOKIE } from "@/lib/workspace";
import { OpError } from "@/lib/crm-operations";
import { isUuid } from "@/lib/ids";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const workspace = await renameWorkspace(ctx.actor, id, parsed.data.name);
    return NextResponse.json({ workspace: { id: workspace.id, name: workspace.firstName } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Failed to rename workspace" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    await deleteNativeWorkspace(ctx.actor, id);
    const res = NextResponse.json({ ok: true });
    if (ctx.account.id === id) {
      res.cookies.set(WORKSPACE_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return res;
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Failed to delete workspace" }, { status: 500 });
  }
}
