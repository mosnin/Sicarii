import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

/**
 * Resolve the Prisma user for the current Clerk session in a server component,
 * provisioning the row on first sight so the app never hard-depends on the
 * Clerk webhook having fired. Returns null only when signed out.
 */
export async function getDbUser(): Promise<User | null> {
  const clerk = await currentUser();
  if (!clerk) return null;

  const email = clerk.emailAddresses?.[0]?.emailAddress ?? "";
  return prisma.user.upsert({
    where: { clerkId: clerk.id },
    update: {},
    create: {
      clerkId: clerk.id,
      email,
      firstName: clerk.firstName ?? undefined,
      lastName: clerk.lastName ?? undefined,
      imageUrl: clerk.imageUrl ?? undefined,
      // Match the Clerk webhook's new-user grant. Without this, a fresh signup
      // provisioned here (before the webhook fires) would fall back to the
      // schema defaults (beta/10000) and keep them permanently.
      plan: "free",
      creditsRemaining: 200,
    },
  });
}
