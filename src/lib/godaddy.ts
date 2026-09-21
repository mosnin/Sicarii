// GoDaddy Domains API. Supports the widely-used v1 sso-key pair and the
// newer v3 Bearer PAT. Search/suggest are live when credentials exist.
// Registration is irreversible and stays opt-in (GODADDY_AUTO_PURCHASE=true
// plus a quote token). Docs:
//   https://developer.godaddy.com/en/docs/api-users/domains/search
//   https://developer.godaddy.com/en/docs/api-users/domains/register

import { fetchWithTimeout } from "@/lib/http";

const V1_BASE = process.env.GODADDY_API_BASE?.trim() || "https://api.godaddy.com";

export interface DomainAvailability {
  domain: string;
  available: boolean;
  priceCents?: number;
  currency?: string;
  periodYears?: number;
  source: "godaddy";
}

export interface DomainSuggestion {
  domain: string;
  available: boolean;
  priceCents?: number;
}

export function godaddyConfigured(): boolean {
  return Boolean(godaddyAuthHeader());
}

function godaddyAuthHeader(): string | null {
  const pat = process.env.GODADDY_PAT?.trim();
  if (pat) return `Bearer ${pat}`;
  const key = process.env.GODADDY_API_KEY?.trim();
  const secret = process.env.GODADDY_API_SECRET?.trim();
  if (key && secret) return `sso-key ${key}:${secret}`;
  return null;
}

async function gdGet<T>(path: string): Promise<T> {
  const auth = godaddyAuthHeader();
  if (!auth) throw new Error("GoDaddy is not configured.");
  const res = await fetchWithTimeout(`${V1_BASE}${path}`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GoDaddy ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function isPlausibleDomain(raw: string): boolean {
  const d = normalizeDomain(raw);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d);
}

export async function checkDomainAvailability(domain: string): Promise<DomainAvailability> {
  const name = normalizeDomain(domain);
  if (!isPlausibleDomain(name)) throw new Error("That does not look like a domain.");

  // Prefer v1 availability (sso-key accounts). Fall back to v3 if v1 404s.
  try {
    const data = await gdGet<{
      available?: boolean;
      domain?: string;
      price?: number;
      currency?: string;
      period?: number;
    }>(`/v1/domains/available?domain=${encodeURIComponent(name)}`);
    return {
      domain: name,
      available: Boolean(data.available),
      priceCents: typeof data.price === "number" ? Math.round(data.price) : undefined,
      currency: data.currency,
      periodYears: data.period,
      source: "godaddy",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes("404") && !msg.includes("v1/domains/available")) throw e;
  }

  const v3 = await gdGet<{
    available?: boolean;
    domain?: string;
    prices?: Array<{ price?: number; currency?: string; period?: number }>;
  }>(`/v3/domains/check-availability?domain=${encodeURIComponent(name)}&optimizeFor=ACCURACY`);
  const price = v3.prices?.[0];
  return {
    domain: name,
    available: Boolean(v3.available),
    priceCents: typeof price?.price === "number" ? Math.round(price.price) : undefined,
    currency: price?.currency,
    periodYears: price?.period,
    source: "godaddy",
  };
}

export async function suggestDomains(query: string, limit = 8): Promise<DomainSuggestion[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await gdGet<Array<{ domain?: string; available?: boolean; price?: number }>>(
    `/v1/domains/suggest?query=${encodeURIComponent(q)}&limit=${Math.min(20, Math.max(1, limit))}`,
  );
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => ({
      domain: typeof row.domain === "string" ? row.domain.toLowerCase() : "",
      available: row.available !== false,
      priceCents: typeof row.price === "number" ? Math.round(row.price) : undefined,
    }))
    .filter((row) => row.domain)
    .slice(0, limit);
}

export function godaddyAutoPurchaseEnabled(): boolean {
  return process.env.GODADDY_AUTO_PURCHASE === "true" && godaddyConfigured();
}
