// Apify actor result mapping. Contact emails must be real and unique; maps
// leads without a usable name are dropped; domain comes from the website host.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apifyGoogleSearch, googleMapsLeads, isApifyConfigured, scrapeSiteContacts } from "@/lib/apify";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isApifyConfigured", () => {
  it("is unconfigured without a token and never runs an actor", async () => {
    vi.stubEnv("APIFY_TOKEN", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isApifyConfigured()).toBe(false);
    await expect(googleMapsLeads("dentists")).rejects.toThrow(/APIFY_TOKEN is not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("googleMapsLeads", () => {
  beforeEach(() => {
    vi.stubEnv("APIFY_TOKEN", "apify-test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("derives domain from the website host and drops one-character or nameless rows", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse([
        {
          title: "Acme Dental",
          website: "https://www.AcmeDental.com/home",
          phoneUnformatted: "+15550001",
          address: "1 Main",
          categoryName: "Dentist",
          url: "https://maps.google.com/?cid=1",
        },
        { name: "A", website: "https://too-short.example" },
        { website: "https://noname.example" },
      ]),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const leads = await googleMapsLeads("dentists", { location: "Austin, TX", limit: 99 });
    expect(leads).toEqual([
      {
        companyName: "Acme Dental",
        website: "https://www.AcmeDental.com/home",
        domain: "acmedental.com",
        phone: "+15550001",
        address: "1 Main",
        industry: "Dentist",
        sourceUrl: "https://maps.google.com/?cid=1",
      },
    ]);
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.maxCrawledPlacesPerSearch).toBe(20);
    expect(body.locationQuery).toBe("Austin, TX");
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("compass~crawler-google-places");
  });

  it("returns [] when the actor payload is not an array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "not-items" })));
    await expect(googleMapsLeads("dentists")).resolves.toEqual([]);
  });
});

describe("scrapeSiteContacts", () => {
  beforeEach(() => {
    vi.stubEnv("APIFY_TOKEN", "apify-test");
  });

  it("dedupes emails and skips missing-@ / spaced values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            emails: ["Ada@Acme.com", "not-an-email", "ada@acme.com", "ada spaced@acme.com", ""],
            phones: ["+1"],
            linkedIns: ["https://linkedin.com/in/ada"],
            twitters: ["https://x.com/ada"],
            url: "https://acme.com/team",
          },
        ]),
      ),
    );
    await expect(scrapeSiteContacts("acme.com")).resolves.toEqual([
      {
        email: "ada@acme.com",
        phone: "+1",
        linkedin: "https://linkedin.com/in/ada",
        twitter: "https://x.com/ada",
        company: "acme.com",
        website: "https://acme.com/team",
      },
    ]);
  });
});

describe("apifyGoogleSearch", () => {
  beforeEach(() => {
    vi.stubEnv("APIFY_TOKEN", "apify-test");
  });

  it("flattens organicResults and skips rows without a url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            organicResults: [
              { url: "https://a.com", title: "A", description: "one" },
              { title: "no url" },
            ],
          },
          { organicResults: "not-an-array" },
        ]),
      ),
    );
    await expect(apifyGoogleSearch("q")).resolves.toEqual([
      { url: "https://a.com", title: "A", description: "one" },
    ]);
  });
});
