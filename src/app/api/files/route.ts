import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
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

    const projectFiles = await db
      .select()
      .from(files)
      .where(eq(files.projectId, projectId))
      .limit(100);

    return NextResponse.json(projectFiles);
  } catch (error) {
    console.error("Files error:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }
}

const postFileSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(500),
  url: z.string().url().max(2000),
  size: z.number().int().positive().max(500_000_000).optional(),
  type: z.string().max(255).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    const body = await req.json();
    const parsed = postFileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { projectId, name, url, size, type } = parsed.data;

    await verifyProjectAccess(projectId, user.id, user.role);
    await checkRateLimit(user.id + ':files', 20);

    const [file] = await db
      .insert(files)
      .values({
        projectId,
        uploadedBy: user.id,
        name,
        url,
        size,
        type,
      })
      .returning();

    return NextResponse.json(file);
  } catch (error) {
    console.error("File upload error:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: "Failed to save file" },
      { status: 500 }
    );
  }
}
