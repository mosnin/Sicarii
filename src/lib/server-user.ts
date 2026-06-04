import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

/**
 * Resolve the Prisma user for the current Clerk session in a server component.
 * Returns null if signed out or the webhook hasn't synced the user yet.
 */
export async function getDbUser(): Promise<User | null> {
  const clerk = await currentUser();
  if (!clerk) return null;
  return prisma.user.findUnique({ where: { clerkId: clerk.id } });
}
