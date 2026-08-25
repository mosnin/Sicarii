// UK Companies House client.
//
// Free API (register for a key). Data is Crown copyright under the Open
// Government Licence v3.0: commercial reuse and redistribution permitted WITH
// attribution (see CH_ATTRIBUTION). Base: https://api.company-information.service.gov.uk
// Auth: HTTP Basic, API key as username, blank password.
import { fetchWithTimeout } from "@/lib/http";
import { normalizeCompany } from "@/lib/providers/gleif";

const BASE = "https://api.company-information.service.gov.uk";

export const CH_ATTRIBUTION =
  "Contains public sector information licensed under the Open Government Licence v3.0.";

export function isCompaniesHouseConfigured(): boolean {
  return Boolean(process.env.COMPANIES_HOUSE_API_KEY?.trim());
}

function authHeader(): string {
  const key = process.env.COMPANIES_HOUSE_API_KEY?.trim() ?? "";
  // Basic auth: key as username, empty password.
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export interface CompaniesHouseMatch {
  companyNumber: string;
  companyName: string;
  status?: string; // active / dissolved / liquidation
  type?: string;
  incorporationDate?: string;
  address?: string;
  sicCodes?: string[];
  officers?: { name: string; role?: string }[];
  source: "companies_house";
}

type CHSearchItem = { title?: string; company_number?: string };
type CHProfile = {
  company_name?: string;
  company_status?: string;
  type?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
};
type CHOfficers = { items?: { name?: string; officer_role?: string }[] };

async function chGet<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE}${path}`, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

function assembleAddress(a?: CHProfile["registered_office_address"]): string | undefined {
  if (!a) return undefined;
  const parts = [
    a.address_line_1,
    a.address_line_2,
    a.locality,
    a.region,
    a.postal_code,
    a.country,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(", ") : undefined;
}

/** Look up a UK company by name. Returns null unless the top result is a strong
 *  name match, then hydrates profile + officers. Requires COMPANIES_HOUSE_API_KEY. */
export async function companiesHouseLookup(name: string): Promise<CompaniesHouseMatch | null> {
  if (!isCompaniesHouseConfigured()) return null;

  const search = await chGet<{ items?: CHSearchItem[] }>(
    `/search/companies?q=${encodeURIComponent(name)}&items_per_page=5`,
  );
  const item = (search?.items ?? []).find(
    (i) => normalizeCompany(i.title ?? "") === normalizeCompany(name),
  );
  if (!item?.company_number) return null;

  const profile = await chGet<CHProfile>(`/company/${item.company_number}`);
  if (!profile) return null;

  const officersRes = await chGet<CHOfficers>(`/company/${item.company_number}/officers`);
  const officers = (officersRes?.items ?? [])
    .filter((o) => o.name)
    .slice(0, 10)
    .map((o) => ({ name: o.name as string, role: o.officer_role }));

  return {
    companyNumber: item.company_number,
    companyName: profile.company_name ?? item.title ?? name,
    status: profile.company_status,
    type: profile.type,
    incorporationDate: profile.date_of_creation,
    address: assembleAddress(profile.registered_office_address),
    sicCodes: profile.sic_codes,
    officers: officers.length ? officers : undefined,
    source: "companies_house",
  };
}
