// Firecrawl client for deep website analysis: pull company context and find
// people/contacts from a company's own site.
// Base: https://api.firecrawl.dev/v2  Auth: Authorization: Bearer fc-KEY

const BASE = "https://api.firecrawl.dev/v2";

export function isFirecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim());
}

// A company logo we can TRUST: keyed off the verified domain, so it is always
// the company's own mark and can never be a scraped blog image or a property
// photo the model happened to grab (the accuracy rule, applied to images).
// Clearbit returns a real logo for the domain and 404s when there is none, so
// CrmAvatar falls back to the initial. Prefer no logo over a wrong logo.
export function companyLogoUrl(domainOrUrl?: string | null): string | undefined {
  if (!domainOrUrl) return undefined;
  let host: string;
  try {
    host = new URL(domainOrUrl.startsWith("http") ? domainOrUrl : `https://${domainOrUrl}`).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/^www\./, "").toLowerCase();
  if (!host.includes(".")) return undefined;
  return `https://logo.clearbit.com/${host}`;
}

function key() {
  const k = process.env.FIRECRAWL_API_KEY?.trim();
  if (!k) throw new Error("FIRECRAWL_API_KEY is not set");
  return k;
}

export interface SiteContact {
  name?: string;
  title?: string;
  email?: string;
  linkedin?: string;
  photo?: string;
}

export interface SiteAnalysis {
  description?: string;
  industry?: string;
  location?: string;
  phone?: string;
  logoUrl?: string;
  services?: string[];
  contacts: SiteContact[];
  markdown?: string;
}

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string", description: "Concise description of what the company does" },
    industry: { type: "string" },
    location: { type: "string", description: "HQ or main location" },
    phone: { type: "string", description: "Main contact phone number" },
    // logo intentionally NOT extracted here - a scraped page image is unreliable
    // (blog heroes, property photos). The logo is derived from the domain below.
    services: { type: "array", items: { type: "string" } },
    contacts: {
      type: "array",
      description: "Named team members or decision makers found on the site",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          email: { type: "string" },
          linkedin: { type: "string", description: "LinkedIn profile URL" },
          photo: { type: "string", description: "Absolute URL of the person's photo" },
        },
      },
    },
  },
} as const;

// Deep-analyze a single company URL. Best-effort: returns whatever Firecrawl's
// structured extraction yields, plus markdown for context.
export async function analyzeSite(url: string): Promise<SiteAnalysis> {
  const target = url.startsWith("http") ? url : `https://${url}`;
  const res = await fetch(`${BASE}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify({
      url: target,
      onlyMainContent: true,
      formats: [
        "markdown",
        {
          type: "json",
          prompt:
            "Analyze this company's website. Extract a concise company description, industry, HQ location, main phone number, key services, and any named team members or decision makers with their title, email, LinkedIn URL, and photo image URL if shown.",
          schema: ANALYSIS_SCHEMA,
        },
      ],
    }),
  });

  const text = await res.text();
  console.log(`[firecrawl] scrape ${target} -> ${res.status}: ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`Firecrawl scrape failed (${res.status}): ${text.slice(0, 200)}`);

  const body = JSON.parse(text) as {
    data?: { json?: Partial<SiteAnalysis>; extract?: Partial<SiteAnalysis>; markdown?: string };
  };
  const json = body.data?.json ?? body.data?.extract ?? {};
  const contacts = Array.isArray(json.contacts) ? (json.contacts as SiteContact[]) : [];

  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    description: s(json.description),
    industry: s(json.industry),
    location: s(json.location),
    phone: s(json.phone),
    // Domain-derived, never the scraped page image. Correct by construction.
    logoUrl: companyLogoUrl(target),
    services: Array.isArray(json.services) ? (json.services as string[]) : undefined,
    contacts,
    markdown: body.data?.markdown,
  };
}

export interface FirecrawlSearchResult {
  url: string;
  title?: string;
  description?: string;
}

// Web search via Firecrawl. Returns top results with title/description.
export async function firecrawlSearch(query: string, limit = 5): Promise<FirecrawlSearchResult[]> {
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify({ query, limit }),
  });
  const text = await res.text();
  console.log(`[firecrawl] search "${query.slice(0, 60)}" -> ${res.status}`);
  if (!res.ok) throw new Error(`Firecrawl search failed (${res.status}): ${text.slice(0, 160)}`);

  const body = JSON.parse(text) as {
    data?: unknown;
    web?: unknown;
  };
  const raw = (Array.isArray(body.data) ? body.data
    : Array.isArray((body.data as { web?: unknown })?.web) ? (body.data as { web: unknown[] }).web
    : Array.isArray(body.web) ? body.web
    : []) as Record<string, unknown>[];

  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return raw
    .map((r) => ({ url: s(r.url) ?? "", title: s(r.title), description: s(r.description) ?? s(r.snippet) }))
    .filter((r) => r.url);
}
