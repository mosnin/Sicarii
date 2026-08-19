import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { authenticateApiKey, bearerFromRequest } from "@/lib/api-auth";
import { ensureAdminRole } from "@/lib/admin";
import { readWorkspaceCookie, resolveCookieWorkspace } from "@/lib/workspace";

export type DbUser = User;

/** The full auth context: the ACCOUNT queries scope to (the home account, or
 *  the active Scalar workspace) plus the human ACTOR (always the personal
 *  row). account.id === actor.id on the home account. Workspaces are Scalar-
 *  native; Clerk Organizations are not the switcher. */
export interface AuthContext {
  account: DbUser;
  actor: DbUser;
  /** Our role string in the active workspace ("admin" | "member"), or null on
   *  the home account. */
  workspaceRole: string | null;
}

// Provision-on-first-sight for the personal row (the app never hard-depends on
// the Clerk webhook having fired).
async function personalRow(clerkId: string): Promise<DbUser> {
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) return existing;
  const clerk = await currentUser();
  const email = clerk?.emailAddresses?.[0]?.emailAddress ?? "";
  return prisma.user.upsert({
    where: { clerkId },
    update: {},
    create: {
      clerkId,
      email,
      firstName: clerk?.firstName ?? undefined,
      lastName: clerk?.lastName ?? undefined,
      imageUrl: clerk?.imageUrl ?? undefined,
      // Match the Clerk webhook's new-user grant (free/200), not the schema
      // defaults (beta/10000) which are only for migrated existing users.
      plan: "free",
      creditsRemaining: 200,
    },
  });
}

/**
 * The full auth context for the current session. Throws a NextResponse 401
 * when signed out; callers catch `NextResponse` in their error handler.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await ensureAdminRole(await personalRow(clerkId));
  const cookieId = await readWorkspaceCookie();
  if (cookieId) {
    const viaCookie = await resolveCookieWorkspace(actor, cookieId);
    if (viaCookie) {
      return { account: viaCookie.account, actor, workspaceRole: viaCookie.workspaceRole };
    }
  }

  return { account: actor, actor, workspaceRole: null };
}

/**
 * Get the authenticated DB account the request should scope to: the home
 * account, or the Scalar workspace selected in the sidebar switcher.
 * Throws a NextResponse 401 when there is no signed-in session.
 */
export async function getAuthenticatedUser(): Promise<DbUser> {
  const ctx = await getAuthContext();
  return ctx.account;
}

/**
 * Resolve the user behind a request from either a connected agent (Authorization:
 * Bearer scl_... API key) or a signed-in human (Clerk session), or null when
 * neither identifies a user. Used by endpoints that both agents and people call,
 * like the x402 payment routes. The API key is tried first so agent traffic never
 * depends on a browser session. A workspace-minted key resolves to the workspace
 * account, so team agents pay into and spend from the pooled team meter.
 */
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
