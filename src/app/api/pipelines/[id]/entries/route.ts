import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

const STAGES = ["NEW", "ENRICHED", "PROSPECTING", "ENGAGING", "REPLYING", "WON", "LOST"] as const;
const CONVO = ["OPEN", "AWAITING_REPLY", "STALLED", "CLOSED"] as const;

async function ownPipeline(id: string, userId: string) {
  const p = await prisma.pipeline.findUnique({ where: { id } });
  return p && p.userId === userId ? p : null;
}

const addSchema = z.object({
  contactIds: z.array(z.string().uuid()).max(500).optional(),
  segmentId: z.string().uuid().optional(),
});

// POST - add contacts (or a whole segment) to the pipeline as NEW entries.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    if (!(await ownPipeline(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    let ids = parsed.data.contactIds ?? [];
    if (parsed.data.segmentId) {
      const seg = await prisma.segment.findUnique({
        where: { id: parsed.data.segmentId },
        include: { members: { select: { contactId: true } } },
      });
      if (seg && seg.userId === user.id) ids = [...ids, ...seg.members.map((m) => m.contactId)];
    }
    if (ids.length === 0) return NextResponse.json({ error: "No contacts to add" }, { status: 400 });

    const owned = await prisma.contact.findMany({ where: { userId: user.id, id: { in: ids } }, select: { id: true } });
    const res = await prisma.pipelineEntry.createMany({
      data: owned.map((c) => ({ userId: user.id, pipelineId: id, contactId: c.id })),
      skipDuplicates: true,
    });
    return NextResponse.json({ added: res.count });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST pipeline entries", e);
    return NextResponse.json({ error: "Failed to add entries" }, { status: 500 });
  }
}

const patchSchema = z.object({
  entryId: z.string().uuid(),
  stage: z.enum(STAGES).optional(),
  dealScore: z.number().int().min(0).max(100).nullable().optional(),
  conversationStatus: z.enum(CONVO).optional(),
});

// PATCH - update one entry's stage / deal score / conversation status.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    if (!(await ownPipeline(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    const { entryId, ...rest } = parsed.data;

    const entry = await prisma.pipelineEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.userId !== user.id || entry.pipelineId !== id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const updated = await prisma.pipelineEntry.update({
      where: { id: entryId },
      data: { ...rest, lastActivityAt: new Date() },
    });
    return NextResponse.json({ entry: updated });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("PATCH pipeline entries", e);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}
