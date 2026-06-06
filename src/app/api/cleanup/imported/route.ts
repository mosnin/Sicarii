import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// Sources that the Synthoz firehose bug could have flooded the CRM with. The
// default cleanup targets the misattributed webhook records only; callers can
// pass an explicit list to purge other auto-import sources.
const DEFAULT_SOURCES = ["synthoz-webhook"];

// POST /api/cleanup/imported  body: { sources?: string[] }
// Bulk-deletes the authenticated user's entities + contacts that came from the
// given auto-import sources. Scoped to the caller's own records only.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const body = (await req.json().catch(() => null)) as { sources?: unknown } | null;
    const sources =
      Array.isArray(body?.sources) && body!.sources.every((s) => typeof s === "string") && body!.sources.length
        ? (body!.sources as string[])
        : DEFAULT_SOURCES;

    const [contacts, entities] = await prisma.$transaction([
      prisma.contact.deleteMany({ where: { userId: user.id, source: { in: sources } } }),
      prisma.entity.deleteMany({ where: { userId: user.id, source: { in: sources } } }),
    ]);

    return NextResponse.json({
      ok: true,
      sources,
      deletedContacts: contacts.count,
      deletedEntities: entities.count,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/cleanup/imported", e);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
