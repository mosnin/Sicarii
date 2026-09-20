export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { exaResearchContacts, isExaConfigured, isMeaningful } from "@/lib/exa";

// POST /api/entities/[id]/spawn-contacts - deep-research the decision makers at
// this company via Exa, then create contacts for any the CRM doesn't already
// have (deduplicated by email, and by name within this entity).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`spawn-contacts:${user.id}`, 10, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const entity = await prisma.entity.findUnique({ where: { id } });
    if (!entity || entity.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isExaConfigured()) {
      return NextResponse.json({ error: "Exa is not configured on this deployment." }, { status: 501 });
    }

    const found = await exaResearchContacts(entity.name, entity.domain ?? undefined, 10);
    if (found.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0, message: "No new contacts found." });
    }

    // Existing contacts: emails (global to user) + names already on this entity.
    const existingContacts = await prisma.contact.findMany({
      where: { userId: user.id, OR: [{ entityId: id }, { email: { not: null } }] },
      select: { email: true, name: true, entityId: true },
    });
    const existingEmails = new Set(
      existingContacts.map((c) => c.email?.trim().toLowerCase()).filter(Boolean)
    );
    const existingNamesOnEntity = new Set(
      existingContacts
        .filter((c) => c.entityId === id)
        .map((c) => c.name?.trim().toLowerCase())
        .filter(Boolean)
    );

    let created = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const p of found) {
      const name = p.name?.trim();
      // Hard guard: never create a contact without a real name.
      if (!isMeaningful(name)) { skipped++; continue; }
      const email = isMeaningful(p.email) ? p.email.trim().toLowerCase() : undefined;
      const nameKey = name.toLowerCase();

      // Dedup: by email globally, by name on this entity, and within this batch.
      const dupe =
        (email && existingEmails.has(email)) ||
        (nameKey && existingNamesOnEntity.has(nameKey)) ||
        (email && seen.has(email)) ||
        (nameKey && seen.has(nameKey));
      if (dupe) { skipped++; continue; }
      if (email) seen.add(email);
      if (nameKey) seen.add(nameKey);

      await prisma.contact.create({
        data: {
          userId: user.id,
          entityId: id,
          name,
          email: email ?? null,
          title: isMeaningful(p.title) ? p.title : null,
          linkedin: isMeaningful(p.linkedin) ? p.linkedin : null,
          company: entity.name,
          website: entity.website || (entity.domain ? `https://${entity.domain}` : null),
          status: "NEW",
          source: "exa:spawn-contacts",
          tags: ["spawned"],
          ...(p.sourceUrl ? { notes: `Researched from ${p.sourceUrl}` } : {}),
        },
      });
      created++;
    }

    return NextResponse.json({ created, skipped });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities/[id]/spawn-contacts", e);
    return NextResponse.json({ error: "Failed to research contacts" }, { status: 500 });
  }
}
