// Domain registrar abstraction. Scalar buys sending domains ON BEHALF of an
// account from its own registrar account and re-bills through Stripe, so the
// customer never touches a registrar. Two adapters:
//
//   GODADDY  - what the operator asked for. Works, with two caveats verified in
//              September 2026: availability/suggest endpoints are gated to
//              accounts holding 50+ domains (or Discount Domain Club), and
//              purchases need the registrant contact + agreement consent.
//              OTE sandbox: set GODADDY_ENV=ote.
//   PORKBUN  - JSON API with no account-size gate, dry-run purchases, and DNS
//              in the same place. Recommended fallback until the GoDaddy
//              account clears the 50-domain threshold.
//
// Which one is live is decided by env (DOMAIN_REGISTRAR, default: whichever
// has credentials, GoDaddy first). Every adapter reports prices in USD cents.
// Nothing here talks to the database.

import { fetchWithTimeout } from "@/lib/http";

export type RegistrarId = "GODADDY" | "PORKBUN";

export interface RegistrantContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // E.164, e.g. +1.5555550123 for GoDaddy, +15555550123 for others
  organization?: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
}

export interface DnsRecordInput {
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT";
  name: string; // "@" for apex, or the subdomain label(s)
  data: string;
  ttl?: number;
  priority?: number;
}

export interface AvailabilityResult {
  domain: string;
  available: boolean;
  priceUsdCents: number | null; // first-year registration, null when unknown
  premium: boolean;
}

export interface PurchaseResult {
  orderRef: string;
  /** Registrars complete asynchronously; PENDING means "poll status". */
  status: "COMPLETED" | "PENDING";
  expiresAt?: Date;
}

export interface DomainRegistrarClient {
  id: RegistrarId;
  checkAvailability(domain: string): Promise<AvailabilityResult>;
  purchase(domain: string, contact: RegistrantContact, opts: { years: number; privacy: boolean; idempotencyKey: string }): Promise<PurchaseResult>;
  /** Replace all records of the given (type,name) pairs; other records untouched. */
  setRecords(domain: string, records: DnsRecordInput[]): Promise<void>;
  getRecords(domain: string): Promise<DnsRecordInput[]>;
}

export class RegistrarError extends Error {
  status: number;
  registrar: RegistrarId;
  constructor(registrar: RegistrarId, message: string, status = 502) {
    super(message);
    this.name = "RegistrarError";
    this.status = status;
    this.registrar = registrar;
  }
}

/* ------------------------------ GoDaddy ------------------------------ */

function godaddyBase(): string {
  return process.env.GODADDY_ENV === "ote" ? "https://api.ote-godaddy.com" : "https://api.godaddy.com";
}

function godaddyAuth(): string | null {
  const pat = process.env.GODADDY_PAT?.trim();
  if (pat) return `Bearer ${pat}`;
  const key = process.env.GODADDY_API_KEY?.trim();
  const secret = process.env.GODADDY_API_SECRET?.trim();
  if (key && secret) return `sso-key ${key}:${secret}`;
  return null;
}

export function isGoDaddyConfigured(): boolean {
  return godaddyAuth() !== null;
}

async function gd<T>(method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const auth = godaddyAuth();
  if (!auth) throw new RegistrarError("GODADDY", "GoDaddy is not configured (GODADDY_PAT or GODADDY_API_KEY/SECRET).", 501);
  const res = await fetchWithTimeout(`${godaddyBase()}${path}`, {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(process.env.GODADDY_SHOPPER_ID ? { "X-Shopper-Id": process.env.GODADDY_SHOPPER_ID } : {}),
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { message?: string; code?: string };
      if (j.message) msg = `${j.code ? j.code + ": " : ""}${j.message}`;
    } catch {
      /* raw text is fine */
    }
    throw new RegistrarError("GODADDY", `GoDaddy ${method} ${path} failed (${res.status}): ${msg}`, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function gdContact(c: RegistrantContact) {
  return {
    nameFirst: c.firstName,
    nameLast: c.lastName,
    email: c.email,
    phone: c.phone,
    ...(c.organization ? { organization: c.organization } : {}),
    addressMailing: {
      address1: c.address1,
      city: c.city,
      state: c.state,
      postalCode: c.postalCode,
      country: c.country,
    },
  };
}

export const godaddy: DomainRegistrarClient = {
  id: "GODADDY",

  async checkAvailability(domain) {
    // Price is in micro-units of the currency (11990000 = $11.99).
    const r = await gd<{ available?: boolean; price?: number; currency?: string; definitive?: boolean }>(
      "GET",
      `/v1/domains/available?domain=${encodeURIComponent(domain)}&checkType=FULL&forTransfer=false`,
    );
    const cents = typeof r.price === "number" ? Math.round(r.price / 10_000) : null;
    return { domain, available: Boolean(r.available), priceUsdCents: r.currency && r.currency !== "USD" ? null : cents, premium: false };
  },

  async purchase(domain, contact, opts) {
    const tld = domain.split(".").slice(1).join(".");
    const agreements = await gd<{ agreementKey: string }[]>(
      "GET",
      `/v1/domains/agreements?tlds=${encodeURIComponent(tld)}&privacy=${opts.privacy}&forTransfer=false`,
    );
    const c = gdContact(contact);
    const r = await gd<{ orderId?: number | string; total?: number; currency?: string }>(
      "POST",
      "/v1/domains/purchase",
      {
        domain,
        period: opts.years,
        privacy: opts.privacy,
        renewAuto: true,
        consent: {
          agreementKeys: agreements.map((a) => a.agreementKey),
          agreedAt: new Date().toISOString(),
          agreedBy: process.env.GODADDY_CONSENT_IP || "127.0.0.1",
        },
        contactRegistrant: c,
        contactAdmin: c,
        contactTech: c,
        contactBilling: c,
      },
      { "Idempotency-Key": opts.idempotencyKey },
    );
    return { orderRef: String(r.orderId ?? ""), status: "PENDING" };
  },

  async setRecords(domain, records) {
    // GoDaddy replaces per (type, name); group so one PUT covers each pair.
    const groups = new Map<string, DnsRecordInput[]>();
    for (const rec of records) {
      const k = `${rec.type}/${rec.name}`;
      groups.set(k, [...(groups.get(k) ?? []), rec]);
    }
    for (const [k, recs] of groups) {
      const [type, name] = k.split("/");
      await gd(
        "PUT",
        `/v1/domains/${encodeURIComponent(domain)}/records/${type}/${encodeURIComponent(name)}`,
        recs.map((r) => ({
          data: r.data,
          ttl: r.ttl ?? 600,
          ...(r.type === "MX" ? { priority: r.priority ?? 10 } : {}),
        })),
      );
    }
  },

  async getRecords(domain) {
    const rows = await gd<{ type: string; name: string; data: string; ttl?: number; priority?: number }[]>(
      "GET",
      `/v1/domains/${encodeURIComponent(domain)}/records`,
    );
    return rows
      .filter((r) => ["A", "AAAA", "CNAME", "MX", "TXT"].includes(r.type))
      .map((r) => ({ type: r.type as DnsRecordInput["type"], name: r.name, data: r.data, ttl: r.ttl, priority: r.priority }));
  },
};

/* ------------------------------ Porkbun ------------------------------ */

const PB_BASE = "https://api.porkbun.com/api/json/v3";

export function isPorkbunConfigured(): boolean {
  return Boolean(process.env.PORKBUN_API_KEY?.trim() && process.env.PORKBUN_SECRET_API_KEY?.trim());
}

async function pb<T extends { status?: string; message?: string }>(path: string, body: Record<string, unknown> = {}, headers?: Record<string, string>): Promise<T> {
  const key = process.env.PORKBUN_API_KEY?.trim();
  const secret = process.env.PORKBUN_SECRET_API_KEY?.trim();
  if (!key || !secret) throw new RegistrarError("PORKBUN", "Porkbun is not configured (PORKBUN_API_KEY / PORKBUN_SECRET_API_KEY).", 501);
  const res = await fetchWithTimeout(`${PB_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
    body: JSON.stringify({ apikey: key, secretapikey: secret, ...body }),
  });
  const text = await res.text();
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    throw new RegistrarError("PORKBUN", `Porkbun ${path} returned non-JSON (${res.status})`, res.status || 502);
  }
  if (!res.ok || json.status !== "SUCCESS") {
    throw new RegistrarError("PORKBUN", `Porkbun ${path} failed: ${json.message ?? res.status}`, res.status === 200 ? 502 : res.status);
  }
  return json;
}

function dollarsToCents(v: unknown): number | null {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const porkbun: DomainRegistrarClient = {
  id: "PORKBUN",

  async checkAvailability(domain) {
    const r = await pb<{ status: string; response?: { avail?: string | boolean; price?: string; premium?: string | boolean } }>(
      `/domain/checkDomain/${encodeURIComponent(domain)}`,
    );
    const avail = r.response?.avail === "yes" || r.response?.avail === true;
    return {
      domain,
      available: avail,
      priceUsdCents: dollarsToCents(r.response?.price),
      premium: r.response?.premium === "yes" || r.response?.premium === true,
    };
  },

  async purchase(domain, _contact, opts) {
    // Porkbun bills the account's own registrant profile; the exact cost from
    // checkDomain must be echoed back, in cents.
    const check = await this.checkAvailability(domain);
    if (!check.available) throw new RegistrarError("PORKBUN", `${domain} is not available.`, 409);
    if (check.premium) throw new RegistrarError("PORKBUN", `${domain} is a premium domain; the API cannot register it.`, 409);
    if (check.priceUsdCents === null) throw new RegistrarError("PORKBUN", `No price returned for ${domain}.`, 502);
    const r = await pb<{ status: string; response?: { orderId?: string | number; expiration?: string } }>(
      `/domain/create/${encodeURIComponent(domain)}`,
      { cost: check.priceUsdCents, agreeToTerms: "yes", whoisPrivacy: opts.privacy, years: opts.years, dryRun: false },
      { "Idempotency-Key": opts.idempotencyKey },
    );
    const exp = r.response?.expiration ? new Date(r.response.expiration) : undefined;
    return { orderRef: String(r.response?.orderId ?? domain), status: "COMPLETED", expiresAt: exp && !Number.isNaN(exp.getTime()) ? exp : undefined };
  },

  async setRecords(domain, records) {
    for (const rec of records) {
      const sub = rec.name === "@" ? "" : rec.name;
      const body = { content: rec.data, ttl: String(rec.ttl ?? 600), ...(rec.type === "MX" ? { prio: String(rec.priority ?? 10) } : {}) };
      try {
        // editByNameType replaces every record of that (type, subdomain) pair.
        await pb(`/dns/editByNameType/${encodeURIComponent(domain)}/${rec.type}/${encodeURIComponent(sub)}`, body);
      } catch (e) {
        // Nothing to edit yet -> create.
        if (!(e instanceof RegistrarError)) throw e;
        await pb(`/dns/create/${encodeURIComponent(domain)}`, { name: sub, type: rec.type, ...body });
      }
    }
  },

  async getRecords(domain) {
    const r = await pb<{ status: string; records?: { type: string; name: string; content: string; ttl?: string; prio?: string }[] }>(
      `/dns/retrieve/${encodeURIComponent(domain)}`,
    );
    const suffix = `.${domain}`;
    return (r.records ?? [])
      .filter((x) => ["A", "AAAA", "CNAME", "MX", "TXT"].includes(x.type))
      .map((x) => ({
        type: x.type as DnsRecordInput["type"],
        name: x.name === domain ? "@" : x.name.endsWith(suffix) ? x.name.slice(0, -suffix.length) : x.name,
        data: x.content,
        ttl: x.ttl ? Number(x.ttl) : undefined,
        priority: x.prio ? Number(x.prio) : undefined,
      }));
  },
};

/* ------------------------------ Selection ------------------------------ */

export function configuredRegistrar(): DomainRegistrarClient | null {
  const pick = process.env.DOMAIN_REGISTRAR?.trim().toLowerCase();
  if (pick === "porkbun") return isPorkbunConfigured() ? porkbun : null;
  if (pick === "godaddy") return isGoDaddyConfigured() ? godaddy : null;
  if (isGoDaddyConfigured()) return godaddy;
  if (isPorkbunConfigured()) return porkbun;
  return null;
}

export function isRegistrarConfigured(): boolean {
  return configuredRegistrar() !== null;
}

/** Baseline records every cold-outreach domain needs, independent of who
 *  hosts the mailboxes: a DMARC policy (required by Google/Yahoo bulk-sender
 *  rules since 2024). SPF/MX/DKIM come from the mailbox provider. */
export function baselineDnsRecords(domain: string, reportTo?: string): DnsRecordInput[] {
  const rua = reportTo ?? `dmarc@${domain}`;
  return [{ type: "TXT", name: "_dmarc", data: `v=DMARC1; p=none; rua=mailto:${rua}; pct=100`, ttl: 3600 }];
}
