// exaFindCompanies is the prospecting entry point (and the primitive the
// swarm fans out). A listicle, directory, or "Unknown" name that slips through
// becomes a CRM entity and every sequence after it. These tests pin the
// local backstops: aggregator hosts, article URLs, junk names, and summary JSON.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exaFindCompanies, isExaConfigured } from "@/lib/exa";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function result(overrides: {
  url?: string;
  title?: string;
  text?: string;
  summary?: string | Record<string, unknown>;
}) {
  return {
    id: "r1",
    url: overrides.url ?? "https://acme.com",
    title: overrides.title ?? "Acme",
    text: overrides.text ?? "We make widgets",
    summary:
      typeof overrides.summary === "object"
        ? JSON.stringify(overrides.summary)
        : overrides.summary,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isExaConfigured", () => {
  it("is off without a key and never fetches", async () => {
    vi.stubEnv("EXA_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isExaConfigured()).toBe(false);
    await expect(exaFindCompanies("dentists miami")).rejects.toThrow(/EXA_API_KEY is not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("exaFindCompanies", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps a real company from summary JSON and derives domain from the website", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            result({
              url: "https://acme.com",
              title: "Acme Inc",
              summary: {
                companyName: "Acme, Inc.",
                website: "https://www.Acme.com/about",
                industry: "Manufacturing",
                address: "Austin, TX",
                phone: "+15550001",
                description: "Widgets",
                keyDecisionMakers: [
                  { name: "Ada Lovelace", title: "CEO" },
                  { name: "Unknown" },
                  { name: "x" },
                ],
              },
            }),
          ],
        }),
      ),
    );
    const found = await exaFindCompanies("widget makers");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      companyName: "Acme, Inc.",
      website: "https://www.Acme.com/about",
      domain: "acme.com",
      industry: "Manufacturing",
      address: "Austin, TX",
      phone: "+15550001",
      description: "Widgets",
      sourceUrl: "https://acme.com",
    });
    expect(found[0]!.keyDecisionMakers).toEqual([{ name: "Ada Lovelace", title: "CEO" }]);
  });

  it("drops aggregator hosts even when the summary looks tidy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            result({
              url: "https://www.ycombinator.com/companies/acme",
              title: "Acme",
              summary: { companyName: "Acme", website: "https://ycombinator.com" },
            }),
            result({
              url: "https://crunchbase.com/organization/acme",
              title: "Acme",
              summary: { companyName: "Acme", website: "https://www.crunchbase.com/organization/acme" },
            }),
            result({
              url: "https://linkedin.com/company/acme",
              title: "Acme",
              summary: { companyName: "Acme", website: "https://linkedin.com/company/acme" },
            }),
          ],
        }),
      ),
    );
    await expect(exaFindCompanies("acme")).resolves.toEqual([]);
  });

  it("drops article and listicle URLs so a 'top 10' post is never a company", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            result({
              url: "https://acme.com/blog/top-startups",
              title: "Top startups",
              summary: { companyName: "Acme", website: "https://acme.com" },
            }),
            result({
              url: "https://news.example.com/2024/best-dentists",
              title: "Best dentists",
              summary: { companyName: "Example Dental", website: "https://example-dental.com" },
            }),
          ],
        }),
      ),
    );
    await expect(exaFindCompanies("dentists")).resolves.toEqual([]);
  });

  it("skips unnamed, junk, and host-less rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            result({ url: "https://no-name.example", title: "", summary: { companyName: "Unknown" } }),
            result({ url: "https://na.example", title: "N/A", summary: { companyName: "n/a" } }),
            result({ url: "not a url", title: "", summary: "{not-json" }),
          ],
        }),
      ),
    );
    await expect(exaFindCompanies("q")).resolves.toEqual([]);
  });

  it("returns [] when results is missing and throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    await expect(exaFindCompanies("q")).resolves.toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "quota" }, false, 429)));
    await expect(exaFindCompanies("q")).rejects.toThrow(/Exa \/search failed \(429\)/);
  });

  it("sends excludeDomains and clamps numResults to 1..50", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchSpy);
    await exaFindCompanies("q", 99);
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.numResults).toBe(50);
    expect(body.excludeDomains).toEqual(expect.arrayContaining(["crunchbase.com", "yelp.com", "linkedin.com"]));
    expect(body.category).toBe("company");
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("https://api.exa.ai/search");
  });
});
