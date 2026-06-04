import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
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

    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10) || 100, 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

    const projectMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.projectId, projectId))
      .orderBy(asc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(projectMessages);
  } catch (error) {
    console.error("Messages error:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

const postMessageSchema = z.object({
  projectId: z.string().uuid(),
  content: z.string().min(1).max(5000),
});

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    const body = await req.json();
    const parsed = postMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { projectId, content } = parsed.data;

    await verifyProjectAccess(projectId, user.id, user.role);
    await checkRateLimit(user.id + ':messages', 30);

    const [message] = await db
      .insert(messages)
      .values({
        projectId,
        senderId: user.id,
        role: user.role === "admin" ? "admin" : "client",
        content,
      })
      .returning();

    return NextResponse.json(message);
  } catch (error) {
    console.error("Message error:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
