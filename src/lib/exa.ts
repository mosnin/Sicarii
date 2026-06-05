// Exa AI search client — neural search, deep research, and monitors.
// Base: https://api.exa.ai  Auth: x-api-key header
// Used for intent scanning (who is looking for a product like yours).

const BASE = "https://api.exa.ai";

function key() {
  const k = process.env.EXA_API_KEY?.trim();
  if (!k) throw new Error("EXA_API_KEY is not set");
  return k;
}

export function isExaConfigured() {
  return Boolean(process.env.EXA_API_KEY?.trim());
}

async function exaPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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
  const res = await fetch(`${BASE}${path}`, {
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
    type: "neural",
    useAutoprompt: true,
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
  const res = await fetch(`${BASE}/monitors`, { headers: { "x-api-key": key() } });
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

function hostFromUrl(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    return new URL(input.startsWith("http") ? input : `https://${input}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export async function exaFindCompanies(prompt: string, count = 10): Promise<FoundCompany[]> {
  const data = await exaPost<{ results?: (ExaResult & { summary?: string })[] }>("/search", {
    query: prompt,
    type: "auto",
    category: "company",
    numResults: Math.min(Math.max(count, 1), 50),
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
    out.push({
      companyName: parsed.companyName || r.title || hostFromUrl(website) || "Unknown",
      industry: parsed.industry,
      address: parsed.address,
      phone: parsed.phone,
      website,
      domain: hostFromUrl(website),
      description: parsed.description || r.text?.slice(0, 300),
      keyDecisionMakers: Array.isArray(parsed.keyDecisionMakers) ? parsed.keyDecisionMakers : undefined,
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
      const key = p.name?.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      people.push({ ...p, sourceUrl: r.url });
      if (people.length >= count) return people;
    }
  }
  return people;
}

// Find a single person's LinkedIn profile URL.
export async function exaFindLinkedIn(name: string, company?: string): Promise<string | null> {
  const results = await exaIntentSearch(
    `LinkedIn profile of ${name}${company ? ` at ${company}` : ""}`,
    { numResults: 5, category: "linkedin profile" }
  );
  const hit = results.find((r) => /linkedin\.com\/in\//i.test(r.url));
  return hit?.url ?? results[0]?.url ?? null;
}
