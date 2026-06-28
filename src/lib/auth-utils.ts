import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { authenticateApiKey, bearerFromRequest } from "@/lib/api-auth";

export type DbUser = User;

/**
 * Get the authenticated DB user, provisioning the row on first sight so the
 * app never hard-depends on the Clerk webhook having fired. Throws a
 * NextResponse 401 only when there is no signed-in session; callers should
 * catch `NextResponse` instances in their error handler.
 */
export async function getAuthenticatedUser(): Promise<DbUser> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) return existing;

  // No row yet (webhook hasn't synced) - create it from the Clerk profile.
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
 * Resolve the user behind a request from either a connected agent (Authorization:
 * Bearer scl_... API key) or a signed-in human (Clerk session), or null when
 * neither identifies a user. Used by endpoints that both agents and people call,
 * like the x402 payment routes. The API key is tried first so agent traffic never
 * depends on a browser session.
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
