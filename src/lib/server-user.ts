import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { ensureAdminRole, isPlatformAdmin } from "@/lib/admin";
import { readWorkspaceCookie, resolveCookieWorkspace } from "@/lib/workspace";

export type DashboardAuth = {
  account: User;
  actor: User;
  workspaceRole: string | null;
  isStaff: boolean;
};

/**
 * Resolve the Prisma account for the current Clerk session in a server
 * component: the personal row, or the workspace row when a team is the active
 * org context (so dashboard pages transparently show the shared team CRM).
 * Provisions rows on first sight so the app never hard-depends on the Clerk
 * webhook having fired. Returns null only when signed out.
 */
export async function getDbUser(): Promise<User | null> {
  const ctx = await getDashboardAuth();
  return ctx?.account ?? null;
}

async function resolveDashboardAuth(personal: User): Promise<DashboardAuth> {
  const actor = await ensureAdminRole(personal);
  const cookieId = await readWorkspaceCookie();
  if (cookieId) {
    const viaCookie = await resolveCookieWorkspace(actor, cookieId);
    if (viaCookie) {
      return {
        account: viaCookie.account,
        actor,
        workspaceRole: viaCookie.workspaceRole,
        isStaff: isPlatformAdmin(actor),
      };
    }
  }
  return { account: actor, actor, workspaceRole: null, isStaff: isPlatformAdmin(actor) };
}

/** Full dashboard auth: the scoped account plus the human actor. */
export async function getDashboardAuth(): Promise<DashboardAuth | null> {
  const clerk = await currentUser();
  if (!clerk) return null;
  const email = clerk.emailAddresses?.[0]?.emailAddress ?? "";
  const personal = await prisma.user.upsert({
    where: { clerkId: clerk.id },
    update: {},
    create: {
      clerkId: clerk.id,
      email,
      firstName: clerk.firstName ?? undefined,
      lastName: clerk.lastName ?? undefined,
      imageUrl: clerk.imageUrl ?? undefined,
      plan: "free",
      creditsRemaining: 200,
    },
  });
  return resolveDashboardAuth(personal);
}
