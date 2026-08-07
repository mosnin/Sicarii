import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { baseCurrencyOf } from "@/lib/currency";
import { moneyTotals, serializeMoney } from "@/lib/conversion";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const pipeline = await prisma.pipeline.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
          include: { contact: { select: { id: true, name: true, email: true, title: true, company: true, imageUrl: true } } },
        },
      },
    });
    if (!pipeline || pipeline.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Money rides along per entry (Decimal strings, never floats) and as one
    // total in the user's reporting currency with its unconverted count.
    const totals = await moneyTotals(user.id, baseCurrencyOf(user), { pipelineId: id });
    return NextResponse.json({
      pipeline: {
        ...pipeline,
        entries: pipeline.entries.map((e) => ({ ...e, money: serializeMoney(e) })),
      },
      money: totals,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to load pipeline" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const p = await prisma.pipeline.findUnique({ where: { id } });
    if (!p || p.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.pipeline.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to delete pipeline" }, { status: 500 });
  }
}
