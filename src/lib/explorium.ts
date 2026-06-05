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

export async function getPeopleAtCompany(domain: string, opts: PeopleAtCompanyOpts = {}) {
  const id = await matchBusiness(domain);
  if (!id) return [];

  const filters: Record<string, unknown> = {
    business_id: { values: [id] },
    has_email: { value: opts.hasEmail ?? true },
  };
  if (opts.jobTitle) filters.job_title = { values: [opts.jobTitle] };
  if (opts.department) filters.job_department = { values: [opts.department] };
  if (opts.level) filters.job_level = { values: [opts.level] };

  type ProspectRes = { data?: unknown[] };
  const data = await post<ProspectRes>("/prospects", {
    mode: "full",
    size: Math.min(opts.limit ?? 20, 50),
    page_size: Math.min(opts.limit ?? 20, 50),
    filters,
  });
  return data.data ?? [];
}

// ── Contact info enrichment (emails + phones) ───────────────────────────────

export async function getContactInfo(prospectIds: string[]) {
  return post<unknown>("/prospects/contacts_information/bulk_enrich", {
    prospect_ids: prospectIds.slice(0, 50),
  });
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
