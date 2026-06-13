// Exa AI search client - neural search, deep research, and monitors.
import { fetchWithTimeout } from "@/lib/http";
// Base: https://api.exa.ai  Auth: x-api-key header
// Used for intent scanning (who is looking for a product like yours).

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.exa.ai";

// ── Webhook authentication ──────────────────────────────────────────────────
// The Exa Monitor callback (/api/webhooks/exa) writes records into a user's CRM
// based only on the monitor_id in the body, so it MUST verify the caller. We
// control both ends - monitor creation registers the webhook URL with this token
// as ?t=, and the receiver requires it - so a forged/abusive request that lacks
// the token is rejected before it can touch the CRM.
//
// The token is derived from a server secret (HMAC), so it needs no extra config
// and is stable across redeploys; set EXA_WEBHOOK_SECRET to override/rotate it.
// Returns null only when no server secret exists at all (misconfiguration), in
// which case the receiver fails closed.
export function exaWebhookToken(): string | null {
  const explicit = process.env.EXA_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  const base = (process.env.MCP_OAUTH_SECRET || process.env.CLERK_SECRET_KEY)?.trim();
  if (!base) return null;
  return createHmac("sha256", base).update("exa-webhook-v1").digest("hex");
}

// Constant-time check of a provided webhook token against the expected one.
export function exaWebhookTokenValid(provided: string | null | undefined): boolean {
  const expected = exaWebhookToken();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function key() {
  const k = process.env.EXA_API_KEY?.trim();
  if (!k) throw new Error("EXA_API_KEY is not set");
  return k;
}

export function isExaConfigured() {
  return Boolean(process.env.EXA_API_KEY?.trim());
}

async function exaPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[exa] POST ${path} → ${res.status}: ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`Exa ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

async function exaDel(path: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method: "DELETE",
    headers: { "x-api-key": key() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa DELETE ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export interface ExaResult {
  id: string;
  url: string;
  title: string;
  score?: number;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
}

export type ExaCategory =
  | "company"
  | "research paper"
  | "news"
  | "tweet"
  | "personal site"
  | "pdf"
  | "github"
  | "linkedin profile";

export interface ExaSearchOptions {
  numResults?: number;
  category?: ExaCategory;
  startPublishedDate?: string;
  endPublishedDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeText?: boolean;
  includeHighlights?: boolean;
  includeSummary?: boolean;
}

type SearchRes = { results?: ExaResult[] };

export async function exaIntentSearch(
  query: string,
  opts: ExaSearchOptions = {}
): Promise<ExaResult[]> {
  const body: Record<string, unknown> = {
    query,
    numResults: opts.numResults ?? 10,
    type: "auto",
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
    ...(opts.endPublishedDate ? { endPublishedDate: opts.endPublishedDate } : {}),
    ...(opts.includeDomains?.length ? { includeDomains: opts.includeDomains } : {}),
    ...(opts.excludeDomains?.length ? { excludeDomains: opts.excludeDomains } : {}),
  };

  const wantContent = opts.includeText || opts.includeHighlights || opts.includeSummary;
  if (wantContent) {
    body.contents = {
      ...(opts.includeText ? { text: { maxCharacters: 800 } } : {}),
      ...(opts.includeHighlights ? { highlights: { numSentences: 3, highlightsPerUrl: 3 } } : {}),
      ...(opts.includeSummary ? { summary: { query } } : {}),
    };
  }

  const data = await exaPost<SearchRes>("/search", body);
  return data.results ?? [];
}

// Deep research: neural + full text + highlights + summary for rich intent signals.
export async function exaDeepSearch(query: string, numResults = 8): Promise<ExaResult[]> {
  return exaIntentSearch(query, {
    numResults,
    includeText: true,
    includeHighlights: true,
    includeSummary: true,
  });
}

// ── Monitors ──────────────────────────────────────────────────────────────────

export interface ExaMonitor {
  id: string;
  query: string;
  type: string;
  webhookUrl: string;
  runEvery: string;
  numResults: number;
  active?: boolean;
  createdAt?: string;
}

export async function createExaMonitor(opts: {
  query: string;
  webhookUrl: string;
  runEvery?: "day" | "week";
  numResults?: number;
}): Promise<ExaMonitor> {
  return exaPost<ExaMonitor>("/monitors", {
    query: opts.query,
    type: "neural",
    webhookUrl: opts.webhookUrl,
    runEvery: opts.runEvery ?? "day",
    numResults: opts.numResults ?? 10,
  });
}

export async function listExaMonitors(): Promise<ExaMonitor[]> {
  const res = await fetchWithTimeout(`${BASE}/monitors`, { headers: { "x-api-key": key() } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Exa list monitors failed (${res.status}): ${text.slice(0, 200)}`);
  type ListRes = { monitors?: ExaMonitor[]; data?: ExaMonitor[] };
  const data = JSON.parse(text) as ListRes;
  return data.monitors ?? data.data ?? [];
}

export async function deleteExaMonitor(monitorId: string): Promise<void> {
  return exaDel(`/monitors/${monitorId}`);
}

// ── Structured entity discovery ─────────────────────────────────────────────
// Deep-research a prompt into a set of companies with CRM-ready fields. Exa
// returns the schema'd extraction as a JSON string in each result's `summary`.

export interface FoundCompany {
  companyName: string;
  industry?: string;
  address?: string;
  phone?: string;
  website?: string;
  domain?: string;
  description?: string;
  keyDecisionMakers?: { name: string; title?: string }[];
  sourceUrl: string;
}

const COMPANY_SCHEMA = {
  type: "object",
  properties: {
    companyName: { type: "string", description: "Official company name" },
    industry: { type: "string", description: "Primary industry or sector" },
    address: { type: "string", description: "Headquarters or main address" },
    phone: { type: "string", description: "Main contact phone number" },
    website: { type: "string", description: "Official website URL" },
    description: { type: "string", description: "What the company does, 1-3 sentences" },
    keyDecisionMakers: {
      type: "array",
      description: "Executives or key decision makers, if found",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
        },
      },
    },
  },
  required: ["companyName"],
} as const;

// Guard against junk values the LLM sometimes emits ("null", "Unknown", "N/A",
// empty) so we never persist meaningless records.
export function isMeaningful(s?: string | null): s is string {
  if (!s) return false;
  const t = s.trim().toLowerCase();
  return (
    t.length > 1 &&
    /[a-z0-9]/i.test(t) &&
    !["null", "undefined", "n/a", "na", "none", "unknown", "-"].includes(t)
  );
}

function hostFromUrl(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    return new URL(input.startsWith("http") ? input : `https://${input}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// Domains that write ABOUT companies (lists, directories, news, social) but are
// not companies themselves. Discovery must never turn one of these into an
// entity, e.g. a "top startups in Miami" article on ycombinator.com. Passed to
// Exa as excludeDomains and re-checked locally as a backstop.
const AGGREGATOR_DOMAINS = [
  "ycombinator.com",
  "crunchbase.com",
  "pitchbook.com",
  "owler.com",
  "zoominfo.com",
  "wellfound.com",
  "angel.co",
  "f6s.com",
  "builtin.com",
  "startupblink.com",
  "linkedin.com",
  "wikipedia.org",
  "medium.com",
  "substack.com",
  "forbes.com",
  "inc.com",
  "techcrunch.com",
  "businessinsider.com",
  "bloomberg.com",
  "g2.com",
  "capterra.com",
  "clutch.co",
  "trustpilot.com",
  "glassdoor.com",
  "indeed.com",
  "yelp.com",
  "yellowpages.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "youtube.com",
  "producthunt.com",
  "github.com",
  "medium.com",
];

function isAggregatorHost(host?: string): boolean {
  if (!host) return true; // no host => can't be a real company homepage
  const h = host.toLowerCase().replace(/^www\./, "");
  return AGGREGATOR_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

// A URL that points at an article/list/profile rather than a company home page.
// Company-category results should be homepages; these path markers signal a
// "10 best ..." listicle or a blog post slipped through.
function looksLikeArticle(url?: string): boolean {
  if (!url) return false;
  return /\/(blog|news|article|articles|posts?|stories|press|p|tag|tags|category|20\d\d)(\/|$|-)/i.test(url);
}

export async function exaFindCompanies(prompt: string, count = 10): Promise<FoundCompany[]> {
  const data = await exaPost<{ results?: (ExaResult & { summary?: string })[] }>("/search", {
    query: prompt,
    type: "auto",
    category: "company",
    numResults: Math.min(Math.max(count, 1), 50),
    excludeDomains: AGGREGATOR_DOMAINS,
    contents: {
      text: { maxCharacters: 600 },
      summary: {
        query: `Extract structured company information for a CRM (name, industry, address, phone, website, description, key decision makers). Search intent: ${prompt}`,
        schema: COMPANY_SCHEMA,
      },
    },
  });

  const out: FoundCompany[] = [];
  for (const r of data.results ?? []) {
    let parsed: Partial<FoundCompany> = {};
    if (r.summary) {
      try { parsed = JSON.parse(r.summary) as Partial<FoundCompany>; } catch { /* summary wasn't JSON */ }
    }
    const website = parsed.website || r.url;
    const host = hostFromUrl(website);
    // Backstop the excludeDomains filter, and drop article/listicle URLs: a
    // "top startups" blog post is not a company, even with a tidy summary.
    if (isAggregatorHost(host) || looksLikeArticle(r.url)) continue;
    const name = parsed.companyName || r.title || host;
    // Skip results we can't name - never emit "Unknown" companies.
    if (!isMeaningful(name)) continue;
    out.push({
      companyName: name,
      industry: parsed.industry,
      address: parsed.address,
      phone: parsed.phone,
      website,
      domain: hostFromUrl(website),
      description: parsed.description || r.text?.slice(0, 300),
      keyDecisionMakers: Array.isArray(parsed.keyDecisionMakers)
        ? parsed.keyDecisionMakers.filter((d) => isMeaningful(d?.name))
        : undefined,
      sourceUrl: r.url,
    });
  }
  return out;
}

// ── Contact research ────────────────────────────────────────────────────────
// Deep-research the decision makers at a company. Returns de-duplicated people.

export interface FoundPerson {
  name: string;
  title?: string;
  email?: string;
  linkedin?: string;
  sourceUrl?: string;
}

const PEOPLE_SCHEMA = {
  type: "object",
  properties: {
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string", description: "Job title or role" },
          email: { type: "string" },
          linkedin: { type: "string", description: "LinkedIn profile URL" },
        },
        required: ["name"],
      },
    },
  },
  required: ["people"],
} as const;

export async function exaResearchContacts(
  company: string,
  domain?: string,
  count = 8
): Promise<FoundPerson[]> {
  const data = await exaPost<{ results?: (ExaResult & { summary?: string })[] }>("/search", {
    query: `Leadership team, executives, and key decision makers at ${company}${domain ? ` (${domain})` : ""}`,
    type: "auto",
    numResults: 10,
    contents: {
      summary: {
        query: `List the key decision makers and executives at ${company} with their name, job title, email, and LinkedIn URL if available.`,
        schema: PEOPLE_SCHEMA,
      },
    },
  });

  const people: FoundPerson[] = [];
  const seen = new Set<string>();
  for (const r of data.results ?? []) {
    if (!r.summary) continue;
    let parsed: { people?: FoundPerson[] } = {};
    try { parsed = JSON.parse(r.summary) as { people?: FoundPerson[] }; } catch { continue; }
    for (const p of parsed.people ?? []) {
      // Skip junk names ("null", "Unknown", …) so we never spawn empty contacts.
      if (!isMeaningful(p?.name)) continue;
      const key = p.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      people.push({
        name: p.name.trim(),
        title: isMeaningful(p.title) ? p.title : undefined,
        email: isMeaningful(p.email) ? p.email : undefined,
        linkedin: isMeaningful(p.linkedin) ? p.linkedin : undefined,
        sourceUrl: r.url,
      });
      if (people.length >= count) return people;
    }
  }
  return people;
}

// Find a single person's LinkedIn profile URL, verified against their company/
// title so a same-name stranger is not returned. When the company is known we
// REQUIRE it to appear in the candidate, and return null otherwise (accuracy
// over coverage) - a wrong profile is worse than none.
export async function exaFindLinkedIn(
  name: string,
  opts: { company?: string; title?: string; location?: string } = {}
): Promise<string | null> {
  const { company, title, location } = opts;
  const query = [`"${name}"`, title, company, location, "LinkedIn profile"]
    .filter(Boolean)
    .join(" ");

  const results = await exaIntentSearch(query, {
    numResults: 10,
    category: "linkedin profile",
    includeText: true,
    includeHighlights: true,
  });

  const candidates = results.filter((r) => /linkedin\.com\/in\//i.test(r.url));
  if (candidates.length === 0) return null;

  const nameTokens = name.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const lastName = nameTokens[nameTokens.length - 1];
  const comp = company?.trim().toLowerCase();
  const titleWords = (title ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  let best: { c: ExaResult; companyHit: boolean; nameHit: boolean; score: number } | null = null;
  for (const c of candidates) {
    const hay = `${c.title ?? ""} ${c.text ?? ""} ${(c.highlights ?? []).join(" ")} ${decodeURIComponent(c.url)}`.toLowerCase();
    const nameHits = nameTokens.filter((t) => hay.includes(t)).length;
    // Name must plausibly match: most tokens present AND the surname present.
    const nameHit = nameHits >= Math.max(1, nameTokens.length - 1) && (!lastName || hay.includes(lastName));
    const companyHit = !!comp && hay.includes(comp);
    const score = (companyHit ? 3 : 0) + (titleWords.some((w) => hay.includes(w)) ? 1 : 0) + (nameHit ? 1 : 0);
    if (!best || score > best.score) best = { c, companyHit, nameHit, score };
  }
  if (!best) return null;

  // ACCURACY RULE: when the company is known, only accept a profile that matches
  // BOTH the person's name AND their company. A wrong profile is never acceptable
  // (same-name strangers) - return null instead. See AGENTS.md / product.md.
  if (comp) return best.companyHit && best.nameHit ? best.c.url : null;
  // No company context: require at least a name match before returning anything.
  return best.nameHit ? best.c.url : null;
}
