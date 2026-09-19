export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { analyzeSite, isFirecrawlConfigured } from "@/lib/firecrawl";
import { isMeaningful } from "@/lib/exa";
import { createContact, getEntity, OpError, updateEntity } from "@/lib/crm-operations";
import { spendCredits, ensureCredits } from "@/lib/credits";
import { gradePage } from "@/lib/jev";

function host(input?: string | null): string | undefined {
  if (!input) return undefined;
  try { return new URL(input.startsWith("http") ? input : `https://${input}`).hostname.replace(/^www\./, ""); }
  catch { return undefined; }
}
function registrable(h: string) {
  const p = h.toLowerCase().replace(/^www\./, "").split(".");
  return p.length <= 2 ? p.join(".") : p.slice(-2).join(".");
}
function sameCompany(a?: string, b?: string) {
  if (!a || !b) return false;
  const x = a.toLowerCase().replace(/^www\./, ""), y = b.toLowerCase().replace(/^www\./, "");
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`) || registrable(x) === registrable(y);
}
function isHttpUrl(u?: string): u is string {
  return !!u && /^https?:\/\/.+/i.test(u);
}

// POST /api/entities/[id]/analyze-site - deep-analyze the entity's website via
// Firecrawl: enrich the company's context (+logo) and create the people found
// on the site as contacts. Company-fit enforced on any emails.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`analyze-site:${user.id}`, 8, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const entity = await getEntity(user.id, id);
    const url = entity.website || (entity.domain ? `https://${entity.domain}` : null);
    if (!url) return NextResponse.json({ error: "This entity has no website to analyze." }, { status: 400 });
    if (!isFirecrawlConfigured()) {
      return NextResponse.json({ error: "Firecrawl is not configured (FIRECRAWL_API_KEY missing)." }, { status: 501 });
    }

    // Gate before the paid Firecrawl call; the debit on success is below.
    await ensureCredits(user.id, "analyze_site");

    const analysis = await analyzeSite(url);

    // ── Merge company context (fill empties; store raw under enrichment) ──
    const stored = entity as { enrichment?: unknown };
    const existing =
      stored.enrichment && typeof stored.enrichment === "object" && !Array.isArray(stored.enrichment)
        ? (stored.enrichment as Record<string, unknown>)
        : {};
    const { markdown: _markdown, ...analysisForStore } = analysis;
    const pageScore = analysis.markdown ? await gradePage(analysis.markdown) : null;
    void _markdown;
    const patch: Parameters<typeof updateEntity>[2] = {
      status: "ENRICHED",
      enrichment: {
        ...existing,
        website_analysis: analysisForStore,
        ...(pageScore ? { website_grade: pageScore } : {}),
      },
    };
    if (!entity.industry && analysis.industry) patch.industry = analysis.industry;
    if (!entity.location && analysis.location) patch.location = analysis.location;
    if (!entity.phone && analysis.phone) patch.phone = analysis.phone;
    if (!entity.description && analysis.description) patch.description = analysis.description;
    if (!entity.logoUrl && isHttpUrl(analysis.logoUrl)) patch.logoUrl = analysis.logoUrl;
    const updated = await updateEntity(user.id, id, patch);

    // ── Create contacts found on the site (deduped, company-fit emails) ──
    const entityDomain = host(entity.website) ?? entity.domain ?? undefined;
    const incomingEmails = analysis.contacts
      .map((p) => (isMeaningful(p.email) ? p.email.trim().toLowerCase() : null))
      .filter((email): email is string => Boolean(email));
    const existingContacts = await prisma.contact.findMany({
      where: {
        userId: user.id,
        OR: [
          { entityId: id },
          ...(incomingEmails.length > 0 ? [{ email: { in: incomingEmails } }] : []),
        ],
      },
      select: { email: true, name: true, entityId: true },
    });
    const existingEmails = new Set(existingContacts.map((c) => c.email?.toLowerCase()).filter(Boolean));
    const namesOnEntity = new Set(
      existingContacts.filter((c) => c.entityId === id).map((c) => c.name?.trim().toLowerCase()).filter(Boolean)
    );

    let created = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const p of analysis.contacts) {
      const name = p.name?.trim();
      if (!isMeaningful(name)) { skipped++; continue; }
      const nameKey = name.toLowerCase();
      // Email only if it fits the company's domain (never a wrong-company email).
      const emailRaw = isMeaningful(p.email) ? p.email.trim().toLowerCase() : undefined;
      const email = emailRaw && emailRaw.includes("@") &&
        (!entityDomain || sameCompany(emailRaw.split("@")[1], entityDomain)) ? emailRaw : undefined;

      if ((email && existingEmails.has(email)) || namesOnEntity.has(nameKey) || seen.has(nameKey)) { skipped++; continue; }
      seen.add(nameKey);

      try {
        await createContact(user.id, {
          entityId: id,
          name,
          email: email ?? null,
          title: isMeaningful(p.title) ? p.title : null,
          linkedin: isMeaningful(p.linkedin) ? p.linkedin : null,
          imageUrl: isHttpUrl(p.photo) ? p.photo : null,
          company: entity.name,
          website: entity.website || (entity.domain ? `https://${entity.domain}` : null),
          status: "NEW",
          source: "firecrawl",
          tags: ["website"],
        });
        created++;
      } catch (err) {
        if (err instanceof OpError) { skipped++; continue; }
        throw err;
      }
    }

    // Debit only after the analysis succeeded and was stored - a miss is free.
    await spendCredits(user.id, "analyze_site", { ref: id });

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      logo: Boolean(updated.logoUrl && !entity.logoUrl),
      grade: pageScore,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/entities/[id]/analyze-site", e);
    return NextResponse.json({ error: "Website analysis failed" }, { status: 502 });
  }
}
