import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export type DbUser = typeof users.$inferSelect;

/**
 * Get the authenticated DB user, or throw a NextResponse error.
 * Callers should catch `NextResponse` instances in their error handler.
 */
export async function getAuthenticatedUser(): Promise<DbUser> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId));

  if (!dbUser) {
    throw NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return dbUser;
}

/**
 * Verify the authenticated user owns a project (or is admin).
 * Throws NextResponse on failure.
 */
export async function verifyProjectAccess(projectId: string, userId: string, role: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    throw NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (role !== "admin" && project.userId !== userId) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return project;
}
