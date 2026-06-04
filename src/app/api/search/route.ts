import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, messages, files } from "@/db/schema";
import { eq, ilike, and, inArray } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    const rateLimit = checkRateLimit(user.id + ":search", 30);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    if (!q || q.trim().length < 2 || q.length > 100) {
      return NextResponse.json([]);
    }

    const pattern = `%${q}%`;

    // Get accessible project IDs based on role
    const accessibleProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        user.role === "admin" ? undefined : eq(projects.userId, user.id)
      );
    const accessibleProjectIds = accessibleProjects.map((p) => p.id);

    if (accessibleProjectIds.length === 0) {
      return NextResponse.json([]);
    }

    // Search projects
    const projectResults = await db
      .select()
      .from(projects)
      .where(
        user.role === "admin"
          ? ilike(projects.name, pattern)
          : and(
              eq(projects.userId, user.id),
              ilike(projects.name, pattern)
            )
      )
      .limit(5);

    // Search messages - filtered by accessible projects
    const messageResults = await db
      .select()
      .from(messages)
      .where(
        and(
          ilike(messages.content, pattern),
          inArray(messages.projectId, accessibleProjectIds)
        )
      )
      .limit(5);

    // Search files - filtered by accessible projects
    const fileResults = await db
      .select()
      .from(files)
      .where(
        and(
          ilike(files.name, pattern),
          inArray(files.projectId, accessibleProjectIds)
        )
      )
      .limit(5);

    const results = [
      ...projectResults.map((p) => ({
        id: p.id,
        type: "project" as const,
        title: p.name,
        subtitle: `${p.serviceType} · ${p.status}`,
        href: `/projects/${p.id}`,
      })),
      ...messageResults.map((m) => ({
        id: m.id,
        type: "message" as const,
        title: m.content.substring(0, 80),
        subtitle: `Message · ${m.role}`,
        href: "/messages",
      })),
      ...fileResults.map((f) => ({
        id: f.id,
        type: "file" as const,
        title: f.name,
        subtitle: `File · ${f.type || "unknown"}`,
        href: `/projects/${f.projectId}`,
      })),
    ];

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to search" },
      { status: 500 }
    );
  }
}
