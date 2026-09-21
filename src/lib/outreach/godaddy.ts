// GoDaddy Domains v3 API client (Card 0015).
//
// Programmatic domain purchase for Scalar's in-app domain shelf:
//   check-availability → registration-quotes (10-min price lock) →
//   registrations (Idempotency-Key + ICANN consent) → poll to terminal state,
// plus DNS record management for SPF/DKIM/DMARC publishing.
// Auth: Bearer PAT (GODADDY_PAT). Docs: https://developer.godaddy.com
//
// Response shapes follow the public v3 reference but have NEVER been exercised
// against the live API here, so every field read off a response is parsed
// defensively (agentphone.ts precedent): runtime typeof/shape checks before
// use, never a bare property access on an assumed path. Shape drift degrades
// to nulls + a console.warn naming the path and the shape actually present.

import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://api.godaddy.com";

export function isGoDaddyConfigured(pat?: string | null): boolean {
  return Boolean((pat ?? process.env.GODADDY_PAT)?.trim());
}

function patOf(pat?: string | null): string {
  const v = (pat ?? process.env.GODADDY_PAT ?? "").trim();
  if (!v) throw new Error("GoDaddy is not configured (GODADDY_PAT missing).");
  return v;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function describeShape(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(length=${v.length})`;
  if (typeof v === "object") return `object(keys=${Object.keys(v).join(",") || "none"})`;
  return typeof v;
}
function warn(path: string, v: unknown): void {
  console.warn(`[godaddy] unexpected shape at ${path}: ${describeShape(v)}`);
}

async function gd<T>(pat: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GoDaddy ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  return (text ? (JSON.parse(text) as T) : {}) as T;
}

export interface AvailabilityResult {
  domain: string;
  available: boolean;
  priceCentsUsd: number | null;
  period: number;
}

export async function checkAvailability(
  domain: string,
  opts: { pat?: string; accurate?: boolean } = {},
): Promise<AvailabilityResult> {
  const key = patOf(opts.pat);
  const q = `/v3/domains/check-availability?domain=${encodeURIComponent(domain)}${opts.accurate ? "&optimizeFor=ACCURACY" : ""}`;
  const raw: unknown = await gd(key, q);
  if (!isRecord(raw)) {
    warn("check-availability", raw);
    return { domain, available: false, priceCentsUsd: null, period: 1 };
  }
  const price = isRecord(raw.price) ? num(raw.price.value) : undefined;
  return {
    domain,
    available: raw.available === true,
    priceCentsUsd: typeof price === "number" ? Math.round(price) : null,
    period: num(raw.period) ?? 1,
  };
}

export interface Suggestion {
  domain: string;
  priceCentsUsd: number | null;
}

export async function getSuggestions(
  query: string,
  opts: { pat?: string; tlds?: string; pageSize?: number } = {},
): Promise<Suggestion[]> {
  const key = patOf(opts.pat);
  const params = new URLSearchParams({
    query,
    pageSize: String(Math.min(Math.max(opts.pageSize ?? 10, 1), 50)),
  });
  if (opts.tlds) params.set("tlds", opts.tlds);
  const raw: unknown = await gd(key, `/v3/domains/suggestions?${params.toString()}`);
  const list = isRecord(raw) && Array.isArray(raw.domains) ? raw.domains : Array.isArray(raw) ? raw : [];
  if (!Array.isArray(list)) {
    warn("suggestions", raw);
    return [];
  }
  const out: Suggestion[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const domain = str(item.domain);
    if (!domain) continue;
    const price = isRecord(item.price) ? num(item.price.value) : undefined;
    out.push({ domain, priceCentsUsd: typeof price === "number" ? Math.round(price) : null });
  }
  return out;
}

export interface RegistrationQuote {
  quoteToken: string;
  priceCentsUsd: number | null;
  period: number;
  requiredAgreements: string[];
  expiresAt: string | null;
}

export async function requestQuote(
  domain: string,
  opts: { pat?: string; period?: number } = {},
): Promise<RegistrationQuote> {
  const key = patOf(opts.pat);
  const raw: unknown = await gd(key, "/v3/domains/registration-quotes", {
    method: "POST",
    body: JSON.stringify({ domain, period: opts.period ?? 1 }),
  });
  if (!isRecord(raw)) {
    warn("registration-quotes", raw);
    throw new Error("GoDaddy quote returned an unexpected shape.");
  }
  const token = str(raw.quoteToken);
  if (!token) throw new Error("GoDaddy quote missing quoteToken (domain may be unavailable).");
  const price = isRecord(raw.price) ? num(raw.price.value) : undefined;
  const agreements = Array.isArray(raw.requiredAgreements)
    ? raw.requiredAgreements.filter((a): a is string => typeof a === "string")
    : [];
  return {
    quoteToken: token,
    priceCentsUsd: typeof price === "number" ? Math.round(price) : null,
    period: num(raw.period) ?? 1,
    requiredAgreements: agreements,
    expiresAt: str(raw.expiresAt) ?? null,
  };
}

export interface RegistrationSubmit {
  /** Poll URL (links[rel=self]) for the async operation. */
  operationUrl: string | null;
  operationId: string | null;
}

export async function submitRegistration(args: {
  quoteToken: string;
  domain: string;
  period: number;
  agreementTypes: string[];
  acknowledgedFees?: Array<{ type: string; amount: number; currency: string }>;
  idempotencyKey: string;
  pat?: string;
}): Promise<RegistrationSubmit> {
  const key = patOf(args.pat);
  const raw: unknown = await gd(key, "/v3/domains/registrations", {
    method: "POST",
    headers: { "Idempotency-Key": args.idempotencyKey },
    body: JSON.stringify({
      quoteToken: args.quoteToken,
      domain: args.domain,
      period: args.period,
      consent: {
        agreedAt: new Date().toISOString(),
        agreementTypes: args.agreementTypes,
        ...(args.acknowledgedFees ? { acknowledgedFees: args.acknowledgedFees } : {}),
      },
    }),
  });
  if (!isRecord(raw)) {
    warn("registrations", raw);
    return { operationUrl: null, operationId: null };
  }
  const links = Array.isArray(raw.links) ? raw.links : [];
  const self = links.find((l) => isRecord(l) && l.rel === "self");
  const operationUrl = (self && isRecord(self) ? str(self.href) : null) ?? null;
  const operationId = str(raw.operationId) ?? str(raw.id) ?? null;
  return { operationUrl, operationId };
}

export type OperationStatus = "PENDING" | "COMPLETED" | "FAILED" | "UNKNOWN";

/** Poll a registration operation to its terminal state. Accepts either the full poll URL or an operation id. */
export async function pollOperation(
  operationUrlOrId: string,
  opts: { pat?: string } = {},
): Promise<{ status: OperationStatus; detail: string | null }> {
  const key = patOf(opts.pat);
  const path = operationUrlOrId.startsWith("http")
    ? operationUrlOrId.slice(BASE.length)
    : `/v3/domains/operations/${encodeURIComponent(operationUrlOrId)}`;
  const raw: unknown = await gd(key, path);
  if (!isRecord(raw)) {
    warn("operation", raw);
    return { status: "UNKNOWN", detail: null };
  }
  const s = str(raw.status)?.toUpperCase();
  const status: OperationStatus = s === "COMPLETED" || s === "FAILED" || s === "PENDING" ? s : "UNKNOWN";
  return { status, detail: str(raw.message) ?? str(raw.error) ?? null };
}

export interface DnsApiRecord {
  type: string;
  name: string;
  data: string;
  ttl: number;
}

/** Publish (replace) DNS records of one type/name on a domain we manage. */
export async function setDnsRecords(
  domain: string,
  type: "TXT" | "CNAME",
  name: string,
  records: Array<{ data: string; ttl?: number }>,
  opts: { pat?: string } = {},
): Promise<void> {
  const key = patOf(opts.pat);
  await gd(key, `/v1/domains/${encodeURIComponent(domain)}/records/${type}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(records.map((r) => ({ data: r.data, ttl: r.ttl ?? 3600 }))),
  });
}

/** Read current DNS records of one type/name (to confirm a publish landed). */
export async function getDnsRecords(
  domain: string,
  type: "TXT" | "CNAME",
  name: string,
  opts: { pat?: string } = {},
): Promise<DnsApiRecord[]> {
  const key = patOf(opts.pat);
  const raw: unknown = await gd(
    key,
    `/v1/domains/${encodeURIComponent(domain)}/records/${type}/${encodeURIComponent(name)}`,
  );
  if (!Array.isArray(raw)) {
    warn("dns-records", raw);
    return [];
  }
  const out: DnsApiRecord[] = [];
  for (const r of raw) {
    if (!isRecord(r)) continue;
    const t = str(r.type);
    const n = str(r.name);
    const d = str(r.data);
    if (!t || !n || !d) continue;
    out.push({ type: t, name: n, data: d, ttl: num(r.ttl) ?? 3600 });
  }
  return out;
}
