import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth-utils";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    const userProjects =
      user.role === "admin"
        ? await db.select().from(projects).limit(100)
        : await db
            .select()
            .from(projects)
            .where(eq(projects.userId, user.id));

    return NextResponse.json(userProjects);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("Projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
