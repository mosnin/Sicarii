import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// GET /api/segments/[id] - segment with its member contacts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const segment = await prisma.segment.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { score: "desc" },
          include: { contact: { select: { id: true, name: true, email: true, title: true, company: true, status: true, imageUrl: true } } },
        },
      },
    });
    if (!segment || segment.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ segment });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to load segment" }, { status: 500 });
  }
}

// DELETE /api/segments/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const seg = await prisma.segment.findUnique({ where: { id } });
    if (!seg || seg.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.segment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to delete segment" }, { status: 500 });
  }
}
