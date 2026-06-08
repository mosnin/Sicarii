import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { analyzeSite, firecrawlSearch, isFirecrawlConfigured } from "@/lib/firecrawl";
import { isMeaningful } from "@/lib/exa";

export const maxDuration = 60;

const MODEL = process.env.OPENAI_REPORT_MODEL ?? "gpt-5-mini";

// NOTE: OpenAI strict structured outputs reject optional() properties. Use
// nullable() (required key, value may be null) for anything that can be absent.
const reportSchema = z.object({
  summary: z.string().describe("2-4 sentence overview of the company"),
  coreOfferings: z.array(z.string()).describe("Main products or services"),
  targetMarket: z.string().describe("Who they sell to"),
  recentNews: z.array(z.object({
    title: z.string(),
    url: z.string().nullable(),
    date: z.string().nullable(),
  })),
  intentSignals: z.array(z.object({
    signal: z.string().describe("A buying-intent signal: hiring, funding, expansion, launch, etc."),
    source: z.string().nullable(),
  })),
  keyDecisionMakers: z.array(z.object({
    name: z.string(),
    title: z.string().nullable(),
    email: z.string().nullable(),
    linkedin: z.string().nullable(),
  })),
  icpFit: z.object({
    isIcp: z.boolean().describe("Is this company a fit for our ICP?"),
    score: z.number().describe("0-100 how well they fit our ideal customer profile"),
    reasoning: z.string().describe("One sentence on why they are / aren't a fit"),
  }),
});

function host(input?: string | null): string | undefined {
  if (!input) return undefined;
  try { return new URL(input.startsWith("http") ? input : `https://${input}`).hostname.replace(/^www\./, ""); }
  catch { return undefined; }
}
function registrable(h: string) { const p = h.toLowerCase().replace(/^www\./, "").split("."); return p.length <= 2 ? p.join(".") : p.slice(-2).join("."); }
function sameCompany(a?: string, b?: string) {
  if (!a || !b) return false;
  const x = a.toLowerCase().replace(/^www\./, ""), y = b.toLowerCase().replace(/^www\./, "");
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`) || registrable(x) === registrable(y);
}

// POST /api/entities/[id]/deep-report
// Orchestrates Firecrawl analyze + web search, then an OpenAI synthesis into one
// non-overlapping report (offerings, target market, news, intent, decision
// makers). Verifies + adds new decision makers as contacts, and stores the
// report on the entity. Build it once; the model de-duplicates against what we
// already know so context never overlaps.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`deep-report:${user.id}`, 4, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Deep report needs OPENAI_API_KEY." }, { status: 501 });
    }
    if (!isFirecrawlConfigured()) {
      return NextResponse.json({ error: "Deep report needs FIRECRAWL_API_KEY." }, { status: 501 });
    }

    const entity = await prisma.entity.findUnique({
      where: { id },
      include: { contacts: { select: { name: true, email: true } } },
    });
    if (!entity || entity.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const site = entity.website || (entity.domain ? `https://${entity.domain}` : null);
    const entityDomain = host(entity.website) ?? entity.domain ?? undefined;

    // ── Gather: analyze the site + search the web (each best-effort) ──
    const [analysis, news, signals] = await Promise.all([
      site ? analyzeSite(site).catch(() => null) : Promise.resolve(null),
      firecrawlSearch(`${entity.name} news`, 5).catch(() => []),
      firecrawlSearch(`${entity.name} hiring OR funding OR acquisition OR expansion OR launch OR partnership`, 6).catch(() => []),
    ]);

    const knownContacts = entity.contacts.map((c) => c.name).filter(Boolean).join(", ") || "none";
    const knownEnrichment = entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
      ? Object.keys(entity.enrichment as object).join(", ") : "none";

    // ── Synthesize one coherent, non-overlapping report ──
    const { object: report } = await generateObject({
      model: openai(MODEL),
      schema: reportSchema,
      prompt: `You are Scalar's research agent. Assemble ONE coherent intelligence report on this company for a CRM. Do NOT repeat or overlap information we already have, keep each section distinct, and only include facts supported by the sources below. Cite URLs in news/intent sources where possible.

Our product / ideal customer profile (judge icpFit against this):
"""
${(user.productContext ?? "Not provided - infer a reasonable B2B ICP.").slice(0, 3000)}
"""

Company: ${entity.name}
Website: ${site ?? "unknown"}
Already known (avoid overlap): industry=${entity.industry ?? "?"}, location=${entity.location ?? "?"}, description=${entity.description ?? "?"}, existing enrichment sections=${knownEnrichment}, existing contacts=${knownContacts}

Website analysis:
${analysis ? JSON.stringify({ description: analysis.description, industry: analysis.industry, services: analysis.services, contacts: analysis.contacts }).slice(0, 3500) : "unavailable"}
${analysis?.markdown ? `\nSite content excerpt:\n${analysis.markdown.slice(0, 3500)}` : ""}

Recent news results:
${news.map((n) => `- ${n.title ?? ""} (${n.url}) ${n.description ?? ""}`).join("\n").slice(0, 2500) || "none"}

Intent-signal search results:
${signals.map((n) => `- ${n.title ?? ""} (${n.url}) ${n.description ?? ""}`).join("\n").slice(0, 2500) || "none"}

For keyDecisionMakers, include only real named people (executives/leaders) with their title; include email/linkedin only if shown in the sources.`,
    });

    // ── Persist the report + fill empty entity fields ──
    const existing = entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
      ? (entity.enrichment as Record<string, unknown>) : {};
    const data: Prisma.EntityUncheckedUpdateInput = {
      status: "ENRICHED",
      enrichment: { ...existing, deepReport: { ...report, generatedAt: new Date().toISOString() } } as unknown as Prisma.InputJsonValue,
    };
    if (!entity.description && report.summary) data.description = report.summary;
    if (!entity.industry && analysis?.industry) data.industry = analysis.industry;
    if (!entity.location && analysis?.location) data.location = analysis.location;
    if (!entity.phone && analysis?.phone) data.phone = analysis.phone;
    if (!entity.logoUrl && analysis?.logoUrl && /^https?:\/\//.test(analysis.logoUrl)) data.logoUrl = analysis.logoUrl;
    await prisma.entity.update({ where: { id }, data });

    // ── Verify + add new decision makers as contacts ──
    const existingEmails = new Set(entity.contacts.map((c) => c.email?.toLowerCase()).filter(Boolean));
    const existingNames = new Set(entity.contacts.map((c) => c.name?.trim().toLowerCase()).filter(Boolean));
    let created = 0;
    const seen = new Set<string>();
    for (const p of report.keyDecisionMakers) {
      const name = p.name?.trim();
      if (!isMeaningful(name)) continue;
      const nameKey = name.toLowerCase();
      if (existingNames.has(nameKey) || seen.has(nameKey)) continue;
      seen.add(nameKey);
      const emailRaw = isMeaningful(p.email) ? p.email.trim().toLowerCase() : undefined;
      const email = emailRaw && emailRaw.includes("@") &&
        (!entityDomain || sameCompany(emailRaw.split("@")[1], entityDomain)) ? emailRaw : undefined;
      if (email && existingEmails.has(email)) continue;
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
          source: "deep-report",
          tags: ["report"],
        },
      });
      created++;
    }

    return NextResponse.json({ ok: true, created, report });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities/[id]/deep-report", e);
    return NextResponse.json({ error: "Deep report failed" }, { status: 502 });
  }
}
