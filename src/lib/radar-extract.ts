// Turn raw intent-scan results (blog posts, listicles, news, directories) into
// real CRM records. An LLM reads the whole batch and pulls out the actual
// companies and named people mentioned, dropping the publishers/aggregators
// themselves. Shared by the Radar "Add to CRM" button and the auto-add path so
// scheduled and manual runs behave identically (and never dump article pages).

import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { prisma } from "@/lib/prisma";

const MODEL = process.env.OPENAI_REFINER_MODEL ?? "gpt-5-mini";

// nullable() (not optional) for OpenAI strict structured outputs.
const schema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      domain: z.string().nullable(),
      website: z.string().nullable(),
      industry: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
  contacts: z.array(
    z.object({
      name: z.string(),
      title: z.string().nullable(),
      email: z.string().nullable(),
      linkedin: z.string().nullable(),
      company: z.string().nullable(),
    }),
  ),
});

export interface ExtractItem { title?: string; url?: string; summary?: string }
export interface CreatedItem {
  id: string;
  kind: "entity";
  name: string | null;
  domain: string | null;
  url: string | null;
}

function host(input?: string | null): string | undefined {
  if (!input) return undefined;
  try {
    return new URL(input.startsWith("http") ? input : `https://${input}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
const real = (s?: string | null) =>
  Boolean(s && s.trim() && !["null", "unknown", "n/a", "none"].includes(s.trim().toLowerCase()));
const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Publishers/aggregators that should never become an "entity" even if the model
// slips one through (the prompt already asks it to drop these).
const AGGREGATOR_DOMAINS = new Set([
  "medium.com", "substack.com", "linkedin.com", "youtube.com", "reddit.com",
  "forbes.com", "techcrunch.com", "g2.com", "capterra.com", "trustpilot.com",
  "wikipedia.org", "crunchbase.com", "producthunt.com", "yelp.com",
  "facebook.com", "twitter.com", "x.com", "instagram.com", "github.com",
]);

export async function extractAndAddToCrm(
  userId: string,
  items: ExtractItem[],
): Promise<{ entitiesAdded: number; contactsAdded: number; created: CreatedItem[] }> {
  if (!process.env.OPENAI_API_KEY || items.length === 0) {
    return { entitiesAdded: 0, contactsAdded: 0, created: [] };
  }

  const { object } = await generateObject({
    model: openai(MODEL),
    schema,
    prompt: `These are search results (articles, blog posts, listicles, news, directories) from an intent scan. Extract the real companies and named people MENTIONED in them, with context.

Rules:
- Extract the actual businesses discussed, NOT the publisher/blog/news site or the article itself. Never turn an article headline or a media outlet into a company.
- Drop directories, aggregators, listicles, and review sites (medium, forbes, g2, capterra, crunchbase, yelp, etc.).
- Use each company's own domain, not the publisher's.
- Only include people who are actually named (real first/last name), with the company they belong to.
- Deduplicate: never list the same company or person twice.

Results:
${items.map((i) => `- ${i.title ?? ""} (${i.url ?? ""}) ${i.summary ?? ""}`).join("\n").slice(0, 12000)}`,
  });

  // ── Create entities (dedup by domain, then by name; in-batch and vs existing) ──
  const nameToEntityId = new Map<string, string>();
  const seenDomains = new Set<string>();
  const created: CreatedItem[] = [];
  let entitiesAdded = 0;

  for (const e of object.entities) {
    if (!real(e.name)) continue;
    const domain =
      host(e.website) ?? (real(e.domain) ? e.domain!.toLowerCase().replace(/^www\./, "") : undefined);

    // Never save a publisher/aggregator as a company.
    if (domain && AGGREGATOR_DOMAINS.has(domain)) continue;

    const nameKey = normName(e.name);

    // In-batch dedup.
    if (domain && seenDomains.has(domain)) continue;
    if (nameToEntityId.has(nameKey)) continue;

    // Dedup vs what's already in the CRM: by domain when we have one, else by name.
    const existing = await prisma.entity.findFirst({
      where: domain
        ? { userId, domain }
        : { userId, name: { equals: e.name.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      nameToEntityId.set(nameKey, existing.id);
      if (domain) seenDomains.add(domain);
      continue;
    }

    const createdEntity = await prisma.entity.create({
      data: {
        userId,
        name: e.name.trim(),
        domain,
        website: real(e.website) ? e.website : domain ? `https://${domain}` : null,
        industry: real(e.industry) ? e.industry : null,
        description: real(e.description) ? e.description : null,
        source: "radar",
        tags: ["intent"],
      },
    });
    nameToEntityId.set(nameKey, createdEntity.id);
    if (domain) seenDomains.add(domain);
    created.push({
      id: createdEntity.id,
      kind: "entity",
      name: createdEntity.name,
      domain: createdEntity.domain,
      url: createdEntity.website,
    });
    entitiesAdded++;
  }

  // ── Create contacts (linked to a matching entity by company name, deduped) ──
  let contactsAdded = 0;
  const seenContacts = new Set<string>();
  for (const c of object.contacts) {
    if (!real(c.name)) continue;
    const dedupeKey = `${normName(c.name)}|${c.company ? normName(c.company) : ""}`;
    if (seenContacts.has(dedupeKey)) continue;
    seenContacts.add(dedupeKey);

    const entityId = c.company ? nameToEntityId.get(normName(c.company)) : undefined;

    // Skip people already in the CRM (same name + company, or same email).
    const dupe = await prisma.contact.findFirst({
      where: {
        userId,
        OR: [
          ...(real(c.email) ? [{ email: { equals: c.email!.trim(), mode: "insensitive" as const } }] : []),
          {
            name: { equals: c.name.trim(), mode: "insensitive" as const },
            ...(real(c.company)
              ? { company: { equals: c.company!.trim(), mode: "insensitive" as const } }
              : {}),
          },
        ],
      },
      select: { id: true },
    });
    if (dupe) continue;

    await prisma.contact.create({
      data: {
        userId,
        name: c.name.trim(),
        title: real(c.title) ? c.title : null,
        email: real(c.email) ? c.email : null,
        linkedin: real(c.linkedin) ? c.linkedin : null,
        company: real(c.company) ? c.company : null,
        entityId: entityId ?? null,
        source: "radar",
        tags: ["intent"],
      },
    });
    contactsAdded++;
  }

  return { entitiesAdded, contactsAdded, created };
}
