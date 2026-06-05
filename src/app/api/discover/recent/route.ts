import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// Sources that mean "this record came from a discovery/agent flow".
const SOURCES = [
  "discover",
  "discover:enrichment",
  "discover:find-entities",
  "match-entity",
  "intent-monitor",
  "exa-webhook",
  "research-schedule",
  "exa:spawn-contacts",
];

// GET /api/discover/recent - the last 20 contacts + entities added via discovery.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    const [contacts, entities] = await Promise.all([
      prisma.contact.findMany({
        where: { userId: user.id, source: { in: SOURCES } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, name: true, email: true, company: true, title: true, source: true, createdAt: true },
      }),
      prisma.entity.findMany({
        where: { userId: user.id, source: { in: SOURCES } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, name: true, domain: true, location: true, source: true, createdAt: true },
      }),
    ]);

    const results = [
      ...contacts.map((c) => ({ ...c, kind: "contact" as const })),
      ...entities.map((e) => ({ ...e, kind: "entity" as const })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20);

    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to load recent results." }, { status: 500 });
  }
}
