// Social profile discovery (LinkedIn / X / Instagram / Facebook), shared by the
// REST route and the MCP `find_socials` tool so both behave identically.
//
// HARD ACCURACY RULE: never attach a same-name stranger's profile. A profile is
// AUTO-SAVED only when the result matches the contact's full name AND their
// company (or the company domain) in the result title/content. Anything less is
// returned as an unverified candidate for a human or agent to review; we prefer
// an empty field over a wrong one.

import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";
import { spendCredits, ensureCredits } from "@/lib/credits";
import { tavilySearch, isTavilyConfigured, type TavilyResult } from "@/lib/tavily";
import { recordProvenanceBulk, type ProvenanceInput } from "@/lib/provenance";

export type SocialField = "linkedin" | "twitter" | "instagram" | "facebook";

export interface SocialCandidate {
  field: SocialField;
  url: string;
  title: string;
  snippet: string;
  nameMatch: boolean;
  companyMatch: boolean;
  verified: boolean; // nameMatch AND companyMatch: safe to save
}

export interface FindSocialsResult {
  contactId: string;
  saved: Partial<Record<SocialField, string>>;
  candidates: SocialCandidate[];
  message: string;
}

// Which profile field a result URL belongs to, or null for non-profile pages
// (posts, directories, company pages on personal-profile platforms).
function fieldForUrl(raw: string): SocialField | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  const segs = path.split("/").filter(Boolean);

  if (host.endsWith("linkedin.com")) {
    return segs[0] === "in" && segs.length === 2 ? "linkedin" : null;
  }
  if (host === "x.com" || host === "twitter.com") {
    // Profile pages are /handle only; /handle/status/... is a post.
    const reserved = new Set(["i", "home", "search", "hashtag", "intent", "share", "explore"]);
    return segs.length === 1 && !reserved.has(segs[0].toLowerCase()) ? "twitter" : null;
  }
  if (host.endsWith("instagram.com")) {
    const reserved = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv"]);
    return segs.length === 1 && !reserved.has(segs[0].toLowerCase()) ? "instagram" : null;
  }
  if (host.endsWith("facebook.com")) {
    const reserved = new Set([
      "groups", "events", "pages", "marketplace", "watch", "photo", "photos",
      "sharer", "share", "story.php", "profile.php", "public", "people",
    ]);
    if (segs.length === 1 && !reserved.has(segs[0].toLowerCase())) return "facebook";
    // /people/Name/id is also a profile URL shape.
    if (segs[0] === "people" && segs.length >= 2) return "facebook";
    return null;
  }
  return null;
}

// Loose token normalization for matching names/companies inside titles, URLs,
// and snippets: lowercase, strip punctuation and diacritics.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Every name token (first AND last at minimum) appears in the haystack. Single
// token names still require that token, but a one-word name plus no company can
// never verify, so it stays a candidate.
function nameMatches(name: string, haystack: string): boolean {
  const tokens = norm(name).split(" ").filter((t) => t.length > 1);
  if (tokens.length === 0) return false;
  const hay = norm(haystack);
  return tokens.every((t) => hay.includes(t));
}

// Company evidence: a significant token of the company name (or the company
// domain's registrable part) appears in the result title/snippet.
const COMPANY_STOPWORDS = new Set([
  "inc", "llc", "ltd", "corp", "co", "company", "the", "group", "and", "of",
]);
function companyMatches(company: string | undefined, domain: string | undefined, haystack: string): boolean {
  const hay = norm(haystack);
  if (company) {
    const tokens = norm(company)
      .split(" ")
      .filter((t) => t.length > 2 && !COMPANY_STOPWORDS.has(t));
    if (tokens.length > 0 && tokens.every((t) => hay.includes(t))) return true;
  }
  if (domain) {
    const base = domain.toLowerCase().replace(/^www\./, "").split(".")[0];
    if (base && base.length > 2 && hay.includes(base)) return true;
  }
  return false;
}

function toDomain(c?: string | null): string | undefined {
  if (!c) return undefined;
  try {
    return new URL(c.startsWith("http") ? c : `https://${c}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Search the web for a contact's social profiles and save the ones we can
 * verify (name AND company evidence). Unverified hits come back as candidates
 * for review. Costs `find_socials` credits only when the search returns
 * anything usable; a dry search is free.
 */
export async function findContactSocials(
  userId: string,
  contactId: string,
): Promise<FindSocialsResult> {
  if (!isTavilyConfigured())
    throw new OpError("Social discovery is not configured (TAVILY_API_KEY missing).", 501);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { entity: { select: { name: true, domain: true, website: true } } },
  });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  if (!contact.name)
    throw new OpError("Add the contact's name first - we never match profiles without one.", 400);

  const company = contact.company ?? contact.entity?.name ?? undefined;
  const companyDomain =
    toDomain(contact.website) || toDomain(contact.entity?.website) || contact.entity?.domain || undefined;

  // Gate before the paid search; debit below only when something comes back.
  await ensureCredits(userId, "find_socials");

  const missing: SocialField[] = (
    [
      !contact.linkedin ? "linkedin" : null,
      !contact.twitter ? "twitter" : null,
      !contact.instagram ? "instagram" : null,
      !contact.facebook ? "facebook" : null,
    ] as const
  ).filter((f): f is SocialField => f !== null);
  if (missing.length === 0) {
    return { contactId, saved: {}, candidates: [], message: "All social fields are already set." };
  }

  const q = [
    `"${contact.name}"`,
    company ? `"${company}"` : "",
    "profile (site:linkedin.com/in OR site:x.com OR site:twitter.com OR site:instagram.com OR site:facebook.com)",
  ]
    .filter(Boolean)
    .join(" ");
  const results: TavilyResult[] = await tavilySearch(q, { maxResults: 12 });

  const candidates: SocialCandidate[] = [];
  for (const r of results) {
    const field = fieldForUrl(r.url);
    if (!field || !missing.includes(field)) continue;
    const haystack = `${r.title} ${r.url} ${r.content}`;
    const nameOk = nameMatches(contact.name, haystack);
    const companyOk = companyMatches(company, companyDomain, haystack);
    candidates.push({
      field,
      url: r.url,
      title: r.title,
      snippet: r.content.slice(0, 280),
      nameMatch: nameOk,
      companyMatch: companyOk,
      verified: nameOk && companyOk,
    });
  }

  if (candidates.length > 0) {
    await spendCredits(userId, "find_socials", { ref: contactId });
  }

  // Save the best verified candidate per field, never overwriting a set value.
  const saved: Partial<Record<SocialField, string>> = {};
  const provenanceRows: ProvenanceInput[] = [];
  for (const field of missing) {
    const hit = candidates.find((c) => c.field === field && c.verified);
    if (!hit) continue;
    saved[field] = hit.url;
    provenanceRows.push({
      recordType: "contact",
      recordId: contactId,
      field,
      source: "tavily",
      confidence: 75,
      value: hit.url,
    });
  }
  if (Object.keys(saved).length > 0) {
    await prisma.contact.update({ where: { id: contactId }, data: saved });
    await recordProvenanceBulk(provenanceRows);
  }

  const unverified = candidates.filter((c) => !c.verified);
  const message =
    Object.keys(saved).length > 0
      ? `Saved ${Object.keys(saved).length} verified profile(s).${unverified.length ? ` ${unverified.length} unverified candidate(s) returned for review - only save one if you can confirm it is this exact person.` : ""}`
      : candidates.length > 0
        ? "No profile could be verified against both name and company. Candidates returned for review - only save one if you can confirm it is this exact person."
        : "No social profiles found. Nothing was charged or saved.";

  return { contactId, saved, candidates, message };
}
