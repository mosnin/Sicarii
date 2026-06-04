import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectComments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUser, verifyProjectAccess } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    await verifyProjectAccess(projectId, user.id, user.role);

    const comments = await db
      .select()
      .from(projectComments)
      .where(eq(projectComments.projectId, projectId))
      .limit(200);

    return NextResponse.json(comments);
  } catch (error) {
    console.error("Comments error:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

const postCommentSchema = z.object({
  projectId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  parentId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    const body = await req.json();
    const parsed = postCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { projectId, content, parentId } = parsed.data;

    await verifyProjectAccess(projectId, user.id, user.role);
    await checkRateLimit(user.id + ':comments', 20);

    const [comment] = await db
      .insert(projectComments)
      .values({
        projectId,
        userId: user.id,
        content,
        parentId: parentId || null,
      })
      .returning();

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Comment error:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
