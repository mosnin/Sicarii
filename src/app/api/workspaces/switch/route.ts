import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-utils";
import { resolveCookieWorkspace, WORKSPACE_COOKIE } from "@/lib/workspace";

const bodySchema = z.object({
  workspaceId: z.string().uuid().nullable(),
});

function withCookie(res: NextResponse, workspaceId: string | null) {
  if (workspaceId) {
    res.cookies.set(WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    res.cookies.set(WORKSPACE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
  }
  return res;
}

// POST /api/workspaces/switch  { workspaceId: uuid | null }
// null = personal account. Membership is checked so a guessed id is a 404.
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "workspaceId must be a uuid or null" }, { status: 400 });
    }
    const { workspaceId } = parsed.data;
    if (!workspaceId) {
      return withCookie(NextResponse.json({ ok: true, workspaceId: null }), null);
    }
    const resolved = await resolveCookieWorkspace(ctx.actor, workspaceId);
    if (!resolved) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    return withCookie(NextResponse.json({ ok: true, workspaceId }), workspaceId);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to switch workspace" }, { status: 500 });
  }
}
