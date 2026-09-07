import { NextResponse } from "next/server";
import { getAuthContext, ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }

  const { actor } = await getAuthContext();
  const body = (await req.json().catch(() => null)) as { accountId?: unknown } | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  const response = NextResponse.json({ ok: true });

  if (!accountId || accountId === actor.id) {
    response.cookies.delete(ACTIVE_WORKSPACE_COOKIE);
    return response;
  }

  const membership = await prisma.teamMember.findUnique({
    where: { workspaceId_userId: { workspaceId: accountId, userId: actor.id } },
    select: { workspaceId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, accountId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
