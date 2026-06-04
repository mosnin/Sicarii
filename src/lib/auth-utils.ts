import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export type DbUser = User;

/**
 * Get the authenticated DB user, or throw a NextResponse error.
 * Callers should catch `NextResponse` instances in their error handler.
 */
export async function getAuthenticatedUser(): Promise<DbUser> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { clerkId } });

  if (!dbUser) {
    throw NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return dbUser;
}
