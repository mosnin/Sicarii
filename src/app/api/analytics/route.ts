import { NextResponse } from "next/server";
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUser, verifyProjectAccess } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

const createAnalyticsEventSchema = z.object({
  projectId: z.string().uuid(),
  event: z.string().min(1).max(100),
  value: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    await verifyProjectAccess(projectId, user.id, user.role);

    const events = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.projectId, projectId))
      .limit(1000);

    return NextResponse.json(events);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    const body = await req.json();
    const parsed = createAnalyticsEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { projectId, event, value, metadata } = parsed.data;

    await verifyProjectAccess(projectId, user.id, user.role);

    const rateLimit = checkRateLimit(user.id + ":analytics", 60);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const [analyticsEvent] = await db
      .insert(analyticsEvents)
      .values({
        projectId,
        event,
        value,
        metadata,
      })
      .returning();

    return NextResponse.json(analyticsEvent);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("Analytics event error:", error);
    return NextResponse.json(
      { error: "Failed to record event" },
      { status: 500 }
    );
  }
}
