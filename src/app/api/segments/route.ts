import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// GET /api/segments - list segments with member counts.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const segments = await prisma.segment.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { members: true } } },
    });
    return NextResponse.json({ segments });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to list segments" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(2000).optional(),
  contactIds: z.array(z.string().uuid()).max(500).optional(),
});

// POST /api/segments - create a segment manually (optionally with members).
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
    const { name, goal, contactIds } = parsed.data;

    const segment = await prisma.segment.create({
      data: { userId: user.id, name, goal, source: "manual" },
    });

    if (contactIds?.length) {
      // Only attach contacts the user owns.
      const owned = await prisma.contact.findMany({
        where: { userId: user.id, id: { in: contactIds } },
        select: { id: true },
      });
      await prisma.contactSegment.createMany({
        data: owned.map((c) => ({ segmentId: segment.id, contactId: c.id })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ segment }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/segments", e);
    return NextResponse.json({ error: "Failed to create segment" }, { status: 500 });
  }
}
