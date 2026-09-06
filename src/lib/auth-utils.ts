import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { authenticateApiKey, bearerFromRequest } from "@/lib/api-auth";
import { getConvexSessionIdentity, type ConvexSessionIdentity } from "@/lib/convex-session";

export type DbUser = User;
export const ACTIVE_WORKSPACE_COOKIE = "scalar_workspace";

export interface AuthContext {
  account: DbUser;
  actor: DbUser;
  workspaceRole: string | null;
}

function splitName(name: string | null): { firstName?: string; lastName?: string } {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return {};
  return {
    firstName: parts[0],
    ...(parts.length > 1 ? { lastName: parts.slice(1).join(" ") } : {}),
  };
}

async function personalRow(identity: ConvexSessionIdentity): Promise<DbUser> {
  const existing = await prisma.user.findUnique({ where: { authSubject: identity.id } });
  const names = splitName(identity.name);
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(identity.email ? { email: identity.email } : {}),
        ...names,
        ...(identity.image ? { imageUrl: identity.image } : {}),
      },
    });
  }

  if (!identity.email || !identity.emailVerified) {
    throw NextResponse.json(
      { error: "A verified email address is required to use Scalar." },
      { status: 403 },
    );
  }

  const legacy = await prisma.user.findFirst({
    where: { email: { equals: identity.email, mode: "insensitive" }, accountType: "user" },
  });
  if (legacy) {
    if (legacy.authSubject && legacy.authSubject !== identity.id) {
      throw NextResponse.json(
        { error: "This email is already linked to another Scalar identity." },
        { status: 409 },
      );
    }
    return prisma.user.update({
      where: { id: legacy.id },
      data: {
        authProvider: "convex-auth",
        authSubject: identity.id,
        ...names,
        ...(identity.image ? { imageUrl: identity.image } : {}),
      },
    });
  }

  return prisma.user.create({
    data: {
      authProvider: "convex-auth",
      authSubject: identity.id,
      email: identity.email,
      ...names,
      ...(identity.image ? { imageUrl: identity.image } : {}),
      plan: "free",
      creditsRemaining: 200,
    },
  });
}

export async function getOptionalAuthContext(): Promise<AuthContext | null> {
  const identity = await getConvexSessionIdentity();
  if (!identity) return null;
  const actor = await personalRow(identity);
  const workspaceId = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  if (!workspaceId || workspaceId === actor.id) {
    return { account: actor, actor, workspaceRole: null };
  }

  const membership = await prisma.teamMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
    include: { workspace: true },
  });
  if (!membership || membership.workspace.accountType !== "workspace") {
    return { account: actor, actor, workspaceRole: null };
  }
  return { account: membership.workspace, actor, workspaceRole: membership.role };
}

export async function getAuthContext(): Promise<AuthContext> {
  const context = await getOptionalAuthContext();
  if (!context) throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return context;
}

export async function getAuthenticatedUser(): Promise<DbUser> {
  return (await getAuthContext()).account;
}

export async function resolveRequestUser(req: Request): Promise<DbUser | null> {
  const token = bearerFromRequest(req);
  if (token) {
    const byKey = await authenticateApiKey(token);
    if (byKey) return byKey;
  }
  try {
    return await getAuthenticatedUser();
  } catch {
    return null;
  }
}
