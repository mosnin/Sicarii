// Apify client - run a curated set of TRUSTED Apify Actors for lead
// intelligence. One token (APIFY_TOKEN) unlocks several public, well-maintained
// Actors that fit what Scalar does: discover companies, pull a site's contact
// data, and run web search.
//
// We run Actors synchronously and read their dataset in a single call:
//   POST /v2/acts/{actor}/run-sync-get-dataset-items   (Bearer APIFY_TOKEN)
// which returns the dataset items array directly (no polling). Actor ids use a
// "~" separator (user~actor).
//
// CURATION (a trust decision, not an accident): only public, broadly-used
// Actors that map to a real lead-intelligence job are wired here. LinkedIn /
// social-profile scrapers are deliberately EXCLUDED - they are ToS-gray and
// collide with the hard accuracy rule (never attach data for the wrong
// person/company). Prefer a clean, defensible source over a risky one.
//
// HARD ACCURACY RULE still applies downstream: emails/phones pulled from a site
// are tied to THAT site's host (a strong source); company leads carry their own
// website/domain. We never guess a domain from a free-text name.
import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://api.apify.com/v2";

// Public Actor ids (user~actor). These are the trusted ones we install.
const ACTORS = {
  // "Google Maps Scraper" - local business lead gen: name, website, phone,
  // address, category. Net-new: nothing else we run discovers local businesses.
  googleMaps: "compass~crawler-google-places",
  // "Contact Details Scraper" - emails, phones, and socials from a site.
  contactInfo: "vdrmota~contact-info-scraper",
  // "Google Search Results Scraper" - organic SERP results.
  googleSearch: "apify~google-search-scraper",
} as const;

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN?.trim());
}

function token(): string {
  const t = process.env.APIFY_TOKEN?.trim();
  if (!t) throw new Error("APIFY_TOKEN is not set");
  return t;
}

// Run an Actor synchronously and return its dataset items. Timeout sits under
// the 60s route ceiling; keep Actor inputs modest so they finish in time.
async function runActor<T = Record<string, unknown>>(
  actor: string,
  input: Record<string, unknown>,
  timeoutMs = 55_000,
): Promise<T[]> {
  const res = await fetchWithTimeout(
    `${BASE}/acts/${actor}/run-sync-get-dataset-items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify(input),
    },
    timeoutMs,
  );
  const text = await res.text();
  console.log(`[apify] ${actor} -> ${res.status} (${text.length}b)`);
  if (!res.ok) throw new Error(`Apify ${actor} failed (${res.status}): ${text.slice(0, 200)}`);
  try {
    const json = JSON.parse(text);
    return Array.isArray(json) ? (json as T[]) : [];
  } catch {
    return [];
  }
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

function hostOf(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    return new URL(input.startsWith("http") ? input : `https://${input}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return undefined;
  }
}

// ── Google Maps: local business leads ────────────────────────────────────────

export interface MapsLead {
  companyName: string;
  website?: string;
  domain?: string;
  phone?: string;
  address?: string;
  industry?: string;
  sourceUrl?: string;
}

// Find local businesses for a search ("dentists") in a location ("Austin, TX").
export async function googleMapsLeads(
  search: string,
  opts: { location?: string; limit?: number } = {},
): Promise<MapsLead[]> {
  const items = await runActor<Record<string, unknown>>(ACTORS.googleMaps, {
    searchStringsArray: [search],
    locationQuery: opts.location || undefined,
    maxCrawledPlacesPerSearch: Math.min(Math.max(opts.limit ?? 12, 1), 20),
    language: "en",
    skipClosedPlaces: true,
  });

  return items
    .map((r) => {
      const website = str(r.website) ?? str(r.url);
      return {
        companyName: str(r.title) ?? str(r.name) ?? "",
        website: str(r.website),
        domain: hostOf(str(r.website)),
        phone: str(r.phone) ?? str(r.phoneUnformatted),
        address: str(r.address) ?? str(r.street),
        industry: str(r.categoryName) ?? str(r.category),
        sourceUrl: str(r.url) ?? website,
      };
    })
    .filter((l) => l.companyName.length > 1);
}

// ── Contact Details Scraper: a site's emails / phones / socials ──────────────

export interface SiteContactData {
  email: string;
  phone?: string;
  linkedin?: string;
  twitter?: string;
  company?: string;
  website?: string;
}

// Pull contact details from a company site. Returns one record per discovered
// email (deduped), tied to the site host - a strong, accurate company link.
export async function scrapeSiteContacts(
  url: string,
  opts: { maxDepth?: number } = {},
): Promise<SiteContactData[]> {
  const target = url.startsWith("http") ? url : `https://${url}`;
  const items = await runActor<Record<string, unknown>>(ACTORS.contactInfo, {
    startUrls: [{ url: target }],
    maxDepth: Math.min(Math.max(opts.maxDepth ?? 1, 0), 2),
    maxRequestsPerStartUrl: 12,
    considerChildFrames: false,
  });

  const host = hostOf(target);
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  const byEmail = new Map<string, SiteContactData>();
  for (const r of items) {
    const emails = arr(r.emails);
    const phone = arr(r.phones)[0];
    const linkedin = arr(r.linkedIns)[0];
    const twitter = arr(r.twitters)[0];
    const website = str(r.url) ?? target;
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (!email || email.includes(" ") || !email.includes("@")) continue;
      if (byEmail.has(email)) continue;
      byEmail.set(email, { email, phone, linkedin, twitter, company: host, website });
    }
  }
  return [...byEmail.values()];
}

// ── Google Search Results Scraper ────────────────────────────────────────────

export interface ApifySerpResult {
  url: string;
  title?: string;
  description?: string;
}

// Organic Google results for a query, flattened across result pages.
export async function apifyGoogleSearch(query: string, limit = 15): Promise<ApifySerpResult[]> {
  const items = await runActor<Record<string, unknown>>(ACTORS.googleSearch, {
    queries: query,
    resultsPerPage: Math.min(Math.max(limit, 1), 20),
    maxPagesPerQuery: 1,
    languageCode: "en",
    countryCode: "us",
  });

  const out: ApifySerpResult[] = [];
  for (const page of items) {
    const organic = (page as { organicResults?: unknown }).organicResults;
    if (!Array.isArray(organic)) continue;
    for (const o of organic as Record<string, unknown>[]) {
      const url = str(o.url);
      if (!url) continue;
      out.push({ url, title: str(o.title), description: str(o.description) });
    }
  }
  return out;
}
