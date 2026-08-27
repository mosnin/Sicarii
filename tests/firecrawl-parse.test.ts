// Firecrawl scrape/search parsing. A scraped page image must never become the
// company logo; search must tolerate data / data.web / web envelopes.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeSite, firecrawlSearch, isFirecrawlConfigured } from "@/lib/firecrawl";

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

describe("isFirecrawlConfigured", () => {
  it("is unconfigured without a key and never scrapes", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isFirecrawlConfigured()).toBe(false);
    await expect(analyzeSite("acme.com")).rejects.toThrow(/FIRECRAWL_API_KEY is not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("analyzeSite", () => {
  beforeEach(() => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("derives logoUrl from the domain and ignores a scraped image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            json: {
              description: "Makes nails",
              industry: "Beauty",
              logoUrl: "https://cdn.example/blog-hero.jpg",
              contacts: [{ name: "Ada", email: "ada@acme.com" }],
            },
            markdown: "# Acme",
          },
        }),
      ),
    );
    const site = await analyzeSite("https://www.acme.com/team");
    expect(site.logoUrl).toBe("https://logo.clearbit.com/acme.com");
    expect(site.logoUrl).not.toContain("blog-hero");
    expect(site.description).toBe("Makes nails");
    expect(site.contacts).toEqual([{ name: "Ada", email: "ada@acme.com" }]);
    expect(site.markdown).toBe("# Acme");
  });

  it("falls back to data.extract and empty contacts when json is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: { extract: { description: "  Salon  ", contacts: "not-an-array" } },
        }),
      ),
    );
    const site = await analyzeSite("acme.com");
    expect(site.description).toBe("Salon");
    expect(site.contacts).toEqual([]);
    expect(site.logoUrl).toBe("https://logo.clearbit.com/acme.com");
  });

  it("throws on HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "nope" }, false, 502)));
    await expect(analyzeSite("https://acme.com")).rejects.toThrow(/Firecrawl scrape failed \(502\)/);
  });
});

describe("firecrawlSearch", () => {
  beforeEach(() => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("reads data[], then data.web, then web, and drops rows without a url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: [{ url: "https://a.com", title: "A" }, { title: "no url" }],
        }),
      ),
    );
    await expect(firecrawlSearch("q")).resolves.toEqual([{ url: "https://a.com", title: "A" }]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: { web: [{ url: "https://b.com", snippet: "from snippet" }] },
        }),
      ),
    );
    await expect(firecrawlSearch("q")).resolves.toEqual([
      { url: "https://b.com", description: "from snippet" },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ web: [{ url: "https://c.com", description: "C" }] })),
    );
    await expect(firecrawlSearch("q")).resolves.toEqual([{ url: "https://c.com", description: "C" }]);
  });
});
