import { currentUser } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

/**
 * Get (or lazily create) the user's stable webhook token — the secret embedded
 * in their inbound webhook URL for Synthoz async results.
 */
export async function getOrCreateWebhookToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.webhookToken) return user.webhookToken;
  const token = randomUUID().replace(/-/g, "");
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { webhookToken: token },
  });
  return updated.webhookToken!;
}

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
    },
  });
}
