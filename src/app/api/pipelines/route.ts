import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const pipelines = await prisma.pipeline.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { entries: true } } },
    });
    return NextResponse.json({ pipelines });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to list pipelines" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(2000).optional(),
  segmentId: z.string().uuid().optional(), // seed entries from a segment
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid pipeline" }, { status: 400 });
    const { name, goal, segmentId } = parsed.data;

    const pipeline = await prisma.pipeline.create({ data: { userId: user.id, name, goal } });

    // Optionally seed from a segment's members.
    if (segmentId) {
      const seg = await prisma.segment.findUnique({
        where: { id: segmentId },
        include: { members: { select: { contactId: true } } },
      });
      if (seg && seg.userId === user.id && seg.members.length) {
        await prisma.pipelineEntry.createMany({
          data: seg.members.map((m) => ({ userId: user.id, pipelineId: pipeline.id, contactId: m.contactId })),
          skipDuplicates: true,
        });
      }
    }

    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/pipelines", e);
    return NextResponse.json({ error: "Failed to create pipeline" }, { status: 500 });
  }
}
