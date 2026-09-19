import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// Sources that the Synthoz firehose bug could have flooded the CRM with.
// This endpoint only ever deletes these. A caller-controlled list used to
// wipe discovered, shared, and agent-created records on the workspace
// account that getAuthenticatedUser() resolves to in team context.
const ALLOWED_SOURCES = ["synthoz-webhook"] as const;

function requestedSources(body: { sources?: unknown } | null): string[] | { error: string } {
  if (
    !Array.isArray(body?.sources) ||
    !body.sources.every((s) => typeof s === "string") ||
    body.sources.length === 0
  ) {
    return [...ALLOWED_SOURCES];
  }

  const requested = body.sources
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 100);
  if (requested.length === 0) return [...ALLOWED_SOURCES];

  const allowed = new Set<string>(ALLOWED_SOURCES);
  if (requested.some((s) => !allowed.has(s))) {
    return {
      error:
        "Cleanup can only remove synthoz-webhook imports. Discovered and manually added records are kept.",
    };
  }
  return [...new Set(requested)];
}

// POST /api/cleanup/imported  body: { sources?: string[] }
// Bulk-deletes the authenticated account's Synthoz-webhook junk records.
// `sources` is accepted only as a subset of ALLOWED_SOURCES; anything else
// is refused so a team member cannot empty the shared CRM by tag.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const body = (await req.json().catch(() => null)) as { sources?: unknown } | null;
    const sources = requestedSources(body);
    if ("error" in sources) {
      return NextResponse.json({ error: sources.error }, { status: 400 });
    }

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
