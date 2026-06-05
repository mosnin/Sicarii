// Explorium business & prospect intelligence client.
// Base: https://api.explorium.ai  Auth: api_key header
// Workflow: match (domain/name → business_id) → enrich or fetch prospects.

const BASE = "https://api.explorium.ai/v1";

function key() {
  const k = process.env.EXPLORIUM_API_KEY?.trim();
  if (!k) throw new Error("EXPLORIUM_API_KEY is not set");
  return k;
}

export function isExploriumConfigured() {
  return Boolean(process.env.EXPLORIUM_API_KEY?.trim());
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", api_key: key() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[explorium] POST ${path} → ${res.status}: ${text.slice(0, 400)}`);
  if (!res.ok) throw new Error(`Explorium ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

// ── Business match ──────────────────────────────────────────────────────────

export async function matchBusiness(domain: string, name?: string): Promise<string | null> {
  type MatchRes = { matched_businesses?: { business_id?: string }[] };
  const data = await post<MatchRes>("/businesses/match", {
    businesses_to_match: [{ ...(name ? { name } : {}), domain }],
  });
  return data.matched_businesses?.[0]?.business_id ?? null;
}

// ── Business enrichments ────────────────────────────────────────────────────

async function enrichBusiness(type: string, businessId: string) {
  return post<unknown>(`/businesses/${type}/bulk_enrich`, { business_ids: [businessId] });
}

export async function getCompanyProfile(domain: string) {
  const id = await matchBusiness(domain);
  if (!id) return null;
  return enrichBusiness("firmographics", id);
}

// Enrich a domain into both the raw firmographics payload AND extracted,
// column-ready fields. Returns null when Explorium has no match for the domain
// (so callers never persist an empty/null enrichment).
export async function enrichDomain(domain: string): Promise<{
  businessId: string;
  raw: unknown;
  fields: ReturnType<typeof businessToCompany> | null;
} | null> {
  const id = await matchBusiness(domain);
  if (!id) return null;
  const raw = await enrichBusiness("firmographics", id);
  const inner = (raw as { data?: unknown[] } | null)?.data;
  const rec = Array.isArray(inner) ? inner[0] : raw;
  const fields =
    rec && typeof rec === "object" ? businessToCompany(rec as Record<string, unknown>) : null;
  // Guard: if there's genuinely nothing usable, treat as no data.
  const hasAnything =
    raw != null && (Array.isArray(inner) ? inner.length > 0 : Object.keys(raw as object).length > 0);
  if (!hasAnything) return null;
  return { businessId: id, raw, fields };
}

export async function getCompanyFunding(domain: string) {
  const id = await matchBusiness(domain);
  if (!id) return null;
  return enrichBusiness("funding_and_acquisition", id);
}

export async function getCompanyTechStack(domain: string) {
  const id = await matchBusiness(domain);
  if (!id) return null;
  return enrichBusiness("technographics", id);
}

export async function getCompanyLookalikes(domain: string) {
  const id = await matchBusiness(domain);
  if (!id) return null;
  return enrichBusiness("lookalikes", id);
}

export async function getCompanyTraffic(domain: string) {
  const id = await matchBusiness(domain);
  if (!id) return null;
  return enrichBusiness("website_traffic", id);
}

// ── Prospect (people) search ────────────────────────────────────────────────

export interface PeopleAtCompanyOpts {
  jobTitle?: string;
  department?: string;
  level?: string;
  hasEmail?: boolean;
  limit?: number;
}

// Deep-search a value for the first plaintext string under a matching key,
// explicitly skipping hashed/obfuscated fields (e.g. professional_email_hashed).
function pickPlain(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 5 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const v of value) {
      const f = pickPlain(v, keys, depth + 1);
      if (f) return f;
    }
    return undefined;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/hash/i.test(k)) continue;
      if (typeof v === "string" && v.trim() && keys.some((key) => k.toLowerCase().includes(key))) {
        return v.trim();
      }
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
      const f = pickPlain(v, keys, depth + 1);
      if (f) return f;
    }
  }
  return undefined;
}

export interface PersonRecord {
  prospect_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  email?: string;
  phone?: string;
}

// Returns CRM-ready people. Explorium's /prospects returns only a HASHED email,
// so we take the prospect_ids and call contacts_information to resolve plaintext
// emails/phones, then merge — otherwise contacts would save with a useless hash.
export async function getPeopleAtCompany(
  domain: string,
  opts: PeopleAtCompanyOpts = {}
): Promise<PersonRecord[]> {
  const id = await matchBusiness(domain);
  if (!id) return [];

  const filters: Record<string, unknown> = {
    business_id: { values: [id] },
    has_email: { value: opts.hasEmail ?? true },
  };
  if (opts.jobTitle) filters.job_title = { values: [opts.jobTitle] };
  if (opts.department) filters.job_department = { values: [opts.department] };
  if (opts.level) filters.job_level = { values: [opts.level] };

  type Prospect = Record<string, unknown> & { prospect_id?: string };
  type ProspectRes = { data?: Prospect[] };
  const data = await post<ProspectRes>("/prospects", {
    mode: "full",
    size: Math.min(opts.limit ?? 20, 50),
    page_size: Math.min(opts.limit ?? 20, 50),
    filters,
  });
  const prospects = data.data ?? [];

  // Resolve plaintext contact info for these prospects.
  const ids = prospects.map((p) => p.prospect_id).filter((x): x is string => Boolean(x));
  const contactInfoById = new Map<string, unknown>();
  if (ids.length) {
    try {
      const ci = await getContactInfo(ids);
      const rows = (ci as { data?: Record<string, unknown>[] })?.data ?? [];
      for (const row of rows) {
        const pid = (row.prospect_id as string) ?? undefined;
        if (pid) contactInfoById.set(pid, row);
      }
    } catch (e) {
      console.warn("[explorium] contacts_information enrich failed", e);
    }
  }

  return prospects.map((p) => {
    const ci = p.prospect_id ? contactInfoById.get(p.prospect_id) : undefined;
    const location = [p.city, p.region_name, p.country_name]
      .map((x) => (typeof x === "string" ? x : ""))
      .filter(Boolean)
      .join(", ");
    return {
      prospect_id: p.prospect_id,
      full_name: (p.full_name as string) ?? undefined,
      first_name: (p.first_name as string) ?? undefined,
      last_name: (p.last_name as string) ?? undefined,
      title: (p.job_title as string) ?? (p.title as string) ?? undefined,
      company: (p.company_name as string) ?? undefined,
      location: location || undefined,
      linkedin: pickPlain(p, ["linkedin"]),
      email: pickPlain(ci, ["email"]) ?? pickPlain(p, ["professional_email", "business_email"]),
      phone: pickPlain(ci, ["mobile", "phone"]) ?? pickPlain(p, ["phone_number", "mobile"]),
    };
  });
}

// ── Contact info enrichment (emails + phones) ───────────────────────────────

export async function getContactInfo(prospectIds: string[]) {
  return post<unknown>("/prospects/contacts_information/bulk_enrich", {
    prospect_ids: prospectIds.slice(0, 50),
  });
}

// Map an Explorium business record (from /businesses search or lookalikes) into
// the CRM-ready company shape used by the prospect grid.
export function businessToCompany(rec: Record<string, unknown>) {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const location = [rec.city, rec.region_name, rec.country_name]
    .map((x) => (typeof x === "string" ? x : ""))
    .filter(Boolean)
    .join(", ");
  const domain = s(rec.domain) ?? s(rec.website)?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return {
    companyName: s(rec.name) ?? s(rec.company_name) ?? domain ?? "Unknown",
    domain,
    website: s(rec.website) ?? (domain ? `https://${domain}` : undefined),
    industry: s(rec.google_category) ?? s(rec.naics_description) ?? s(rec.industry),
    address: location || undefined,
    phone: s(rec.phone) ?? s(rec.phone_number),
    description: s(rec.business_description) ?? s(rec.description),
  };
}

// ── Company search (filter-based) ───────────────────────────────────────────

export interface SearchCompaniesOpts {
  query?: string;
  country?: string;
  size?: string;
  industry?: string;
  limit?: number;
}

export async function searchCompanies(opts: SearchCompaniesOpts) {
  const filters: Record<string, unknown> = {};
  if (opts.country) filters.country_code = { values: [opts.country.toLowerCase()] };
  if (opts.size) filters.company_size = { values: [opts.size] };
  if (opts.industry) filters.google_category = { values: [opts.industry] };

  type BizRes = { data?: unknown[] };
  const data = await post<BizRes>("/businesses", {
    mode: "full",
    size: Math.min(opts.limit ?? 20, 50),
    page_size: Math.min(opts.limit ?? 20, 50),
    filters,
  });
  return data.data ?? [];
}
