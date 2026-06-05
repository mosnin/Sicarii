import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractAndAddToCrm, type ExtractItem } from "@/lib/radar-extract";

export const maxDuration = 60;

// POST /api/monitor-runs/[id]/add-to-crm - the built-in agent reads the whole run
// report, extracts the real companies + people mentioned (with context), and adds
// them (deduped). It never saves the articles/publishers themselves.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const rate = checkRateLimit(`run-add:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Needs OPENAI_API_KEY." }, { status: 501 });

    const run = await prisma.monitorRun.findUnique({ where: { id } });
    if (!run || run.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const items = Array.isArray(run.items) ? (run.items as ExtractItem[]) : [];
    if (items.length === 0) return NextResponse.json({ error: "This run has no results to add." }, { status: 422 });

    const { entitiesAdded, contactsAdded } = await extractAndAddToCrm(user.id, items);

    await prisma.monitorRun.update({
      where: { id },
      data: { addedToCrm: true, added: run.added + entitiesAdded + contactsAdded },
    });

    return NextResponse.json({ ok: true, entitiesAdded, contactsAdded });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/monitor-runs/[id]/add-to-crm", e);
    return NextResponse.json({ error: "Add to CRM failed" }, { status: 502 });
  }
}
