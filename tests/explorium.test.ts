// Explorium match/enrich and prospect merge. A hashed email or a no-match
// domain must never become a CRM contact or an empty enrichment write.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  businessToCompany,
  enrichDomain,
  getPeopleAtCompany,
  isExploriumConfigured,
  matchBusiness,
} from "@/lib/explorium";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isExploriumConfigured", () => {
  it("is false without a key and never fetches on match", async () => {
    vi.stubEnv("EXPLORIUM_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isExploriumConfigured()).toBe(false);
    await expect(matchBusiness("acme.com")).rejects.toThrow(/EXPLORIUM_API_KEY is not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("businessToCompany", () => {
  it("strips scheme/www/path from website when domain is missing", () => {
    const company = businessToCompany({
      company_name: "Acme",
      website: "https://www.acme.com/about?ref=1",
      city: "Austin",
      region_name: "TX",
      country_name: "US",
      google_category: "Software",
    });
    expect(company.domain).toBe("acme.com");
    expect(company.companyName).toBe("Acme");
    expect(company.address).toBe("Austin, TX, US");
    expect(company.industry).toBe("Software");
    expect(company.website).toBe("https://www.acme.com/about?ref=1");
  });

  it("falls back to domain as the name and synthesizes a website", () => {
    const company = businessToCompany({ domain: "acme.com" });
    expect(company.companyName).toBe("acme.com");
    expect(company.website).toBe("https://acme.com");
  });
});

describe("enrichDomain", () => {
  beforeEach(() => {
    vi.stubEnv("EXPLORIUM_API_KEY", "exp-test");
  });

  it("returns null and does not enrich when match has no business_id", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ matched_businesses: [{}] }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(enrichDomain("stranger.com")).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/businesses/match");
  });

  it("returns null when firmographics data is an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href.includes("/businesses/match")) {
          return jsonResponse({ matched_businesses: [{ business_id: "biz_1" }] });
        }
        return jsonResponse({ data: [] });
      }),
    );
    await expect(enrichDomain("acme.com")).resolves.toBeNull();
  });

  it("extracts column-ready fields from the first firmographics row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href.includes("/businesses/match")) {
          return jsonResponse({ matched_businesses: [{ business_id: "biz_1" }] });
        }
        return jsonResponse({
          data: [{ name: "Acme Inc", domain: "acme.com", city: "Austin", country_name: "US" }],
        });
      }),
    );
    const result = await enrichDomain("acme.com");
    expect(result?.businessId).toBe("biz_1");
    expect(result?.fields).toMatchObject({
      companyName: "Acme Inc",
      domain: "acme.com",
      address: "Austin, US",
    });
  });
});

describe("getPeopleAtCompany", () => {
  beforeEach(() => {
    vi.stubEnv("EXPLORIUM_API_KEY", "exp-test");
  });

  it("never attaches a hashed email when plaintext contact info is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href.includes("/businesses/match")) {
          return jsonResponse({ matched_businesses: [{ business_id: "biz_1" }] });
        }
        if (href.includes("/prospects/contacts_information")) {
          return jsonResponse({ data: [{ prospect_id: "p1", professional_email_hashed: "deadbeef" }] });
        }
        return jsonResponse({
          data: [
            {
              prospect_id: "p1",
              full_name: "Ada Lovelace",
              professional_email_hashed: "deadbeef",
              job_title: "Engineer",
            },
          ],
        });
      }),
    );
    const people = await getPeopleAtCompany("acme.com");
    expect(people).toHaveLength(1);
    expect(people[0]?.email).toBeUndefined();
    expect(people[0]?.full_name).toBe("Ada Lovelace");
    expect(people[0]?.title).toBe("Engineer");
  });

  it("prefers plaintext contact-info email over the prospect hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href.includes("/businesses/match")) {
          return jsonResponse({ matched_businesses: [{ business_id: "biz_1" }] });
        }
        if (href.includes("/prospects/contacts_information")) {
          return jsonResponse({
            data: [{ prospect_id: "p1", professional_email: "ada@acme.com", mobile: "+15551212" }],
          });
        }
        return jsonResponse({
          data: [{ prospect_id: "p1", full_name: "Ada", professional_email_hashed: "deadbeef" }],
        });
      }),
    );
    const people = await getPeopleAtCompany("acme.com");
    expect(people[0]?.email).toBe("ada@acme.com");
    expect(people[0]?.phone).toBe("+15551212");
  });

  it("returns [] when the domain does not match", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ matched_businesses: [] }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(getPeopleAtCompany("nope.com")).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
