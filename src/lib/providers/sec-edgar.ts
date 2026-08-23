// SEC EDGAR client (US public companies).
//
// Public domain (US government work) - free to use and redistribute, no key.
// A descriptive User-Agent header is mandatory (the SEC returns 403 without
// one). Rate limit: 10 req/s. We resolve a company name -> CIK via the EDGAR
// full-text search, then pull firmographics from the submissions API.
import { fetchWithTimeout } from "@/lib/http";
import { normalizeCompany } from "@/lib/providers/gleif";

// EDGAR needs no key; a User-Agent is required (env override, sensible default).
export function isSecEdgarConfigured(): boolean {
  return true;
}

function userAgent(): string {
  return (
    process.env.SEC_EDGAR_USER_AGENT?.trim() ||
    "Scalar CRM enrichment (contact@tryscalar.xyz)"
  );
}

export interface SecEdgarMatch {
  cik: string; // zero-padded 10-digit
  name: string;
  sic?: string;
  sicDescription?: string;
  ein?: string;
  stateOfIncorporation?: string;
  fiscalYearEnd?: string;
  tickers?: string[];
  address?: string;
  source: "sec_edgar";
}

type EftsHit = { _source?: { cik?: string; display_names?: string[] } };
type Submissions = {
  name?: string;
  sic?: string;
  sicDescription?: string;
  ein?: string;
  stateOfIncorporation?: string;
  fiscalYearEnd?: string;
  tickers?: string[];
  addresses?: {
    business?: {
      street1?: string;
      city?: string;
      stateOrCountry?: string;
      zipCode?: string;
    };
  };
};

async function edgarGet<T>(url: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

function displayName(hit: EftsHit): string {
  // display_names look like "APPLE INC (AAPL) (CIK 0000320193)".
  const raw = hit._source?.display_names?.[0] ?? "";
  return raw.replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

function assembleAddress(a?: Submissions["addresses"]): string | undefined {
  const b = a?.business;
  if (!b) return undefined;
  const parts = [b.street1, b.city, b.stateOrCountry, b.zipCode].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length ? parts.join(", ") : undefined;
}

/** Resolve a US public company by name and return its EDGAR firmographics, or
 *  null if there's no strong-name match (most private companies won't match). */
export async function secEdgarLookup(name: string): Promise<SecEdgarMatch | null> {
  const search = await edgarGet<{ hits?: { hits?: EftsHit[] } }>(
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${name}"`)}`,
  );
  const hits = search?.hits?.hits ?? [];
  const hit = hits.find((h) => normalizeCompany(displayName(h)) === normalizeCompany(name));
  const cikRaw = hit?._source?.cik;
  if (!cikRaw) return null;

  const cik = cikRaw.padStart(10, "0");
  const sub = await edgarGet<Submissions>(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!sub) return null;

  return {
    cik,
    name: sub.name ?? displayName(hit as EftsHit),
    sic: sub.sic,
    sicDescription: sub.sicDescription,
    ein: sub.ein,
    stateOfIncorporation: sub.stateOfIncorporation,
    fiscalYearEnd: sub.fiscalYearEnd,
    tickers: sub.tickers?.length ? sub.tickers : undefined,
    address: assembleAddress(sub.addresses),
    source: "sec_edgar",
  };
}
