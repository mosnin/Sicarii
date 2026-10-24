// Registry name matching: a weak match attaches a same-name stranger to the
// CRM entity and every downstream sequence. These tests pin normalize + the
// three public-registry lookups so "Apple" never becomes "Apple Hospitality".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeCompany, gleifLookup } from "@/lib/providers/gleif";
import { companiesHouseLookup } from "@/lib/providers/companies-house";
import { secEdgarLookup } from "@/lib/providers/sec-edgar";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => handler(String(input))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("normalizeCompany", () => {
  it("treats legal suffixes and punctuation as the same company", () => {
    expect(normalizeCompany("Acme, Inc.")).toBe("acme");
    expect(normalizeCompany("ACME INCORPORATED")).toBe("acme");
    expect(normalizeCompany("Acme LLC")).toBe("acme");
    expect(normalizeCompany("Microsoft Corporation")).toBe("microsoft");
    expect(normalizeCompany("Tesla Inc")).toBe("tesla");
  });

  it("does not collapse unrelated companies that merely share a word", () => {
    expect(normalizeCompany("Apple Inc.")).toBe("apple");
    expect(normalizeCompany("Apple Hospitality REIT")).not.toBe(normalizeCompany("Apple Inc."));
    expect(normalizeCompany("Stripe")).not.toBe(normalizeCompany("Stripe Payments"));
  });
});

describe("gleifLookup - strong match only", () => {
  it("returns the record whose legal name matches after suffix stripping", async () => {
    stubFetch(() =>
      jsonResponse({
        data: [
          {
            id: "lei-stranger",
            attributes: { entity: { legalName: { name: "Acme Hospitality Group" } } },
          },
          {
            id: "lei-hit",
            attributes: {
              entity: {
                legalName: { name: "Acme, Inc." },
                jurisdiction: "US-DE",
                status: "ACTIVE",
                headquartersAddress: {
                  addressLines: ["1 Market St"],
                  city: "San Francisco",
                  country: "US",
                },
              },
              registration: { status: "ISSUED" },
            },
          },
        ],
      }),
    );

    const hit = await gleifLookup("ACME INCORPORATED");
    expect(hit).toMatchObject({
      lei: "lei-hit",
      legalName: "Acme, Inc.",
      source: "gleif",
    });
    expect(hit?.address).toContain("San Francisco");
  });

  it("returns null when every candidate is only a substring / same-word stranger", async () => {
    stubFetch(() =>
      jsonResponse({
        data: [
          {
            id: "lei-reit",
            attributes: { entity: { legalName: { name: "Apple Hospitality REIT" } } },
          },
          {
            id: "lei-bank",
            attributes: { entity: { legalName: { name: "Apple Bank" } } },
          },
        ],
      }),
    );

    await expect(gleifLookup("Apple")).resolves.toBeNull();
  });

  it("accepts a close prefix when the shorter name is most of the longer one", async () => {
    stubFetch(() =>
      jsonResponse({
        data: [
          {
            id: "lei-sys",
            attributes: { entity: { legalName: { name: "Acme Systems" } } },
          },
        ],
      }),
    );

    const hit = await gleifLookup("Acme System");
    expect(hit?.lei).toBe("lei-sys");
  });

  it("returns null on a non-OK or empty payload without throwing", async () => {
    stubFetch(() => jsonResponse({ error: "nope" }, false));
    await expect(gleifLookup("Acme")).resolves.toBeNull();

    stubFetch(() => jsonResponse({ data: [] }));
    await expect(gleifLookup("Acme")).resolves.toBeNull();
  });
});

describe("companiesHouseLookup - exact normalized title", () => {
  beforeEach(() => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "ch-test-key");
  });

  it("skips a fuzzy first result and hydrates only an exact title match", async () => {
    stubFetch((url) => {
      if (url.includes("/search/companies")) {
        return jsonResponse({
          items: [
            { title: "ACME HOSPITALITY LTD", company_number: "11111111" },
            { title: "ACME LTD", company_number: "01234567" },
          ],
        });
      }
      if (url.endsWith("/company/01234567")) {
        return jsonResponse({
          company_name: "ACME LTD",
          company_status: "active",
          registered_office_address: {
            address_line_1: "10 Downing St",
            locality: "London",
            postal_code: "SW1A 2AA",
            country: "United Kingdom",
          },
        });
      }
      if (url.endsWith("/officers")) {
        return jsonResponse({ items: [{ name: "Ada Lovelace", officer_role: "director" }] });
      }
      return jsonResponse({}, false);
    });

    const hit = await companiesHouseLookup("Acme Limited");
    expect(hit).toMatchObject({
      companyNumber: "01234567",
      companyName: "ACME LTD",
      source: "companies_house",
    });
    expect(hit?.address).toContain("London");
    expect(hit?.officers?.[0]).toEqual({ name: "Ada Lovelace", role: "director" });
  });

  it("returns null when no search title normalizes to the query", async () => {
    stubFetch(() =>
      jsonResponse({
        items: [{ title: "ACME HOSPITALITY LTD", company_number: "11111111" }],
      }),
    );
    await expect(companiesHouseLookup("Acme")).resolves.toBeNull();
  });

  it("returns null when the API key is missing", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(companiesHouseLookup("Acme Ltd")).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("secEdgarLookup - display-name ticker/CIK stripping", () => {
  it("matches after stripping ticker and CIK suffixes", async () => {
    stubFetch((url) => {
      if (url.includes("search-index")) {
        return jsonResponse({
          hits: {
            hits: [
              {
                _source: {
                  cik: "320193",
                  display_names: ["APPLE INC (AAPL) (CIK 0000320193)"],
                },
              },
            ],
          },
        });
      }
      if (url.includes("submissions/CIK0000320193")) {
        return jsonResponse({
          name: "Apple Inc.",
          sicDescription: "Electronic Computers",
          addresses: {
            business: {
              street1: "One Apple Park Way",
              city: "Cupertino",
              stateOrCountry: "CA",
              zipCode: "95014",
            },
          },
        });
      }
      return jsonResponse({}, false);
    });

    const hit = await secEdgarLookup("Apple Inc.");
    expect(hit).toMatchObject({
      cik: "0000320193",
      name: "Apple Inc.",
      sicDescription: "Electronic Computers",
      source: "sec_edgar",
    });
    expect(hit?.address).toContain("Cupertino");
  });

  it("returns null when the stripped display name is a different company", async () => {
    stubFetch((url) => {
      if (url.includes("search-index")) {
        return jsonResponse({
          hits: {
            hits: [
              {
                _source: {
                  cik: "999999",
                  display_names: ["APPLE HOSPITALITY REIT INC (APLE) (CIK 0000009999)"],
                },
              },
            ],
          },
        });
      }
      throw new Error("submissions must not be fetched for a weak match");
    });

    await expect(secEdgarLookup("Apple Inc.")).resolves.toBeNull();
  });
});
