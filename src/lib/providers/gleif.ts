// GLEIF (Global Legal Entity Identifier Foundation) client.
//
// Open data under CC0 (public domain) - free to use AND redistribute, no key.
// Base: https://api.gleif.org/api/v1 (JSON:API). Rate limit ~60 req/min.
// We use it as the universal "verified legal entity" spine: match a company by
// legal name, then pull its LEI, jurisdiction, registration status, registered
// number (the bridge to national registries), and registered address.
import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://api.gleif.org/api/v1";

// GLEIF needs no credentials; this exists for symmetry with other providers.
export function isGleifConfigured(): boolean {
  return true;
}

export interface LegalEntityMatch {
  lei: string;
  legalName: string;
  jurisdiction?: string; // ISO 3166 country/subdivision, e.g. "US-DE", "GB"
  entityStatus?: string; // ACTIVE / INACTIVE
  registrationStatus?: string; // ISSUED / LAPSED / RETIRED
  registeredAs?: string; // national registry number (e.g. UK company number)
  address?: string; // assembled HQ (or legal) address
  country?: string;
  source: "gleif";
}

type GleifRecord = {
  id?: string;
  attributes?: {
    entity?: {
      legalName?: { name?: string };
      legalAddress?: GleifAddress;
      headquartersAddress?: GleifAddress;
      jurisdiction?: string;
      status?: string;
      registeredAs?: string;
    };
    registration?: { status?: string };
  };
};
type GleifAddress = {
  addressLines?: string[];
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
};

// Strip legal suffixes/punctuation so "Acme, Inc." and "ACME INCORPORATED"
// compare equal. Used to guard against attaching a same-name stranger.
const SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "ltd", "limited", "corp", "corporation",
  "co", "company", "gmbh", "ag", "sa", "sas", "bv", "plc", "group", "holdings",
  "lp", "pllc", "pte", "pvt",
]);
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w))
    .join(" ")
    .trim();
}

function assembleAddress(a?: GleifAddress): string | undefined {
  if (!a) return undefined;
  const parts = [
    ...(a.addressLines ?? []),
    a.city,
    a.region,
    a.postalCode,
    a.country,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(", ") : undefined;
}

// Accept a record only if its legal name is a strong match for the query, so we
// never attach a different company that merely shares a word.
function isStrongMatch(query: string, candidate: string): boolean {
  const q = normalizeCompany(query);
  const c = normalizeCompany(candidate);
  if (!q || !c) return false;
  if (q === c) return true;
  // One fully contains the other and they're close in length (not a substring fluke).
  const [shorter, longer] = q.length <= c.length ? [q, c] : [c, q];
  return longer.startsWith(shorter) && shorter.length / longer.length >= 0.7;
}

/** Look up a company's verified legal entity by name. Returns null on no strong
 *  match (accuracy first: better a null than a same-name stranger). */
export async function gleifLookup(name: string): Promise<LegalEntityMatch | null> {
  const url =
    `${BASE}/lei-records?filter[entity.legalName]=${encodeURIComponent(name)}&page[size]=10`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { headers: { Accept: "application/vnd.api+json" } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { data?: GleifRecord[] } | null;
  const records = data?.data ?? [];

  const match = records.find((r) =>
    isStrongMatch(name, r.attributes?.entity?.legalName?.name ?? ""),
  );
  if (!match || !match.id) return null;

  const e = match.attributes?.entity;
  return {
    lei: match.id,
    legalName: e?.legalName?.name ?? name,
    jurisdiction: e?.jurisdiction,
    entityStatus: e?.status,
    registrationStatus: match.attributes?.registration?.status,
    registeredAs: e?.registeredAs,
    address: assembleAddress(e?.headquartersAddress ?? e?.legalAddress),
    country: (e?.headquartersAddress ?? e?.legalAddress)?.country,
    source: "gleif",
  };
}
