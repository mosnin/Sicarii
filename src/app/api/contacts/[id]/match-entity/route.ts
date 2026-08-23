export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { exaFindCompanies, isExaConfigured, isMeaningful } from "@/lib/exa";

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com",
]);

function toDomain(c?: string | null): string | undefined {
  if (!c) return undefined;
  try {
    return new URL(c.startsWith("http") ? c : `https://${c}`).hostname.replace(/^www\./, "");
  } catch {
    if (/^[\w-]+\.[\w.-]+$/.test(c.trim())) return c.trim().toLowerCase().replace(/^www\./, "");
    return undefined;
  }
}

// Token-overlap check: does a researched company's name actually match the
// contact's stated company? Strips legal suffixes/punctuation and requires most
// tokens to overlap. Guards the accuracy rule: never link a same-name stranger.
function nameMatches(stated: string, candidate: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|group|holdings|the)\b/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  const a = new Set(norm(stated));
  const b = norm(candidate);
  if (a.size === 0 || b.length === 0) return false;
  const hits = b.filter((t) => a.has(t)).length;
  return hits >= Math.max(1, Math.ceil(b.length * 0.6));
}

// POST /api/contacts/[id]/match-entity
// Find (or create) the company this contact works at and link them. Research the
// company via Exa when we don't already know the domain. Never creates a
// duplicate entity - matches an existing one by domain (or name) first.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`match-entity:${user.id}`, 20, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact || contact.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (contact.entityId) {
      const entity = await prisma.entity.findUnique({ where: { id: contact.entityId } });
      return NextResponse.json({ entity, created: false, alreadyLinked: true });
    }

    // Establish what we know about the company.
    const name = isMeaningful(contact.company) ? contact.company!.trim() : undefined;
    let website: string | undefined =
      contact.website && contact.website.startsWith("http") ? contact.website : undefined;
    const emailDomain = contact.email?.includes("@")
      ? contact.email.split("@")[1]?.toLowerCase()
      : undefined;
    // Domain must come from a STRONG source only (the contact's own website or a
    // corporate work-email domain) - never guessed from the free-text company
    // name, which would violate the accuracy rule downstream.
    let domain =
      toDomain(contact.website) ||
      (emailDomain && !FREEMAIL.has(emailDomain) ? emailDomain : undefined);
    let industry: string | undefined;
    let location: string | undefined;
    let phone: string | undefined;

    // Research the company when we still don't have a domain. ACCURACY RULE: only
    // adopt a researched company whose name actually matches the contact's stated
    // company - a search for "Acme" must not link them to a different "Acme".
    if (!domain && name && isExaConfigured()) {
      const found = await exaFindCompanies(`${name} company official website`, 3);
      const best =
        found.find((c) => c.domain && nameMatches(name!, c.companyName)) ??
        found.find((c) => nameMatches(name!, c.companyName));
      if (best) {
        domain = best.domain;
        website = website ?? best.website;
        industry = best.industry;
        location = best.address;
        phone = best.phone;
        // Keep the contact's stated company name; do not overwrite with the match.
      }
    }

    if (!domain && !name) {
      return NextResponse.json(
        { error: "Add a company name, website, or work email to this contact first." },
        { status: 400 }
      );
    }

    // Find an existing entity (no duplicates): by domain, else by name.
    const existing = domain
      ? await prisma.entity.findFirst({ where: { userId: user.id, domain } })
      : await prisma.entity.findFirst({
          where: { userId: user.id, name: { equals: name!, mode: "insensitive" } },
        });

    let entity = existing;
    let created = false;
    if (!entity) {
      entity = await prisma.entity.create({
        data: {
          userId: user.id,
          name: name || domain!,
          domain,
          website: website ?? (domain ? `https://${domain}` : null),
          industry: industry ?? null,
          location: location ?? null,
          phone: phone ?? null,
          source: "match-entity",
          status: "NEW",
        },
      });
      created = true;
    }

    await prisma.contact.update({
      where: { id },
      data: {
        entityId: entity.id,
        // Backfill the contact's company name if it was empty.
        ...(!contact.company && entity.name ? { company: entity.name } : {}),
      },
    });

    return NextResponse.json({ entity, created });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/contacts/[id]/match-entity", e);
    return NextResponse.json({ error: "Failed to match a company" }, { status: 500 });
  }
}
