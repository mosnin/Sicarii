// Bright Data SERP/unlocker client. A non-JSON SERP body must degrade to
// { raw } instead of throwing into search_web; a missing key must never fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { googleSerp, isBrightDataConfigured, scrapeUrl } from "@/lib/brightdata";

function textResponse(text: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isBrightDataConfigured", () => {
  it("is off without a key and never fetches", async () => {
    vi.stubEnv("BRIGHT_DATA_API_KEY", "   ");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isBrightDataConfigured()).toBe(false);
    await expect(googleSerp("dentists miami")).rejects.toThrow(/BRIGHT_DATA_API_KEY is not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("googleSerp", () => {
  beforeEach(() => {
    vi.stubEnv("BRIGHT_DATA_API_KEY", "bd-test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("parses a JSON SERP body", async () => {
    const fetchSpy = vi.fn(async () =>
      textResponse(JSON.stringify({ organic: [{ title: "Acme", link: "https://acme.com" }] })),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await expect(googleSerp("acme", "gb")).resolves.toEqual({
      organic: [{ title: "Acme", link: "https://acme.com" }],
    });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: "Bearer bd-test" });
    const body = JSON.parse(String(init.body));
    expect(body.zone).toBe("serp_api");
    expect(body.format).toBe("json");
    expect(body.country).toBe("gb");
    expect(String(body.url)).toContain("gl=gb");
    expect(String(body.url)).toContain(encodeURIComponent("acme"));
  });

  it("falls back to { raw } when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textResponse("<html>serp</html>")));
    await expect(googleSerp("q")).resolves.toEqual({ raw: "<html>serp</html>" });
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textResponse("quota", false, 429)));
    await expect(googleSerp("q")).rejects.toThrow(/Bright Data failed \(429\)/);
  });
});

describe("scrapeUrl", () => {
  beforeEach(() => {
    vi.stubEnv("BRIGHT_DATA_API_KEY", "bd-test");
  });

  it("posts the unlocker zone and returns the raw markdown body", async () => {
    vi.stubEnv("BRIGHT_DATA_UNLOCKER_ZONE", "custom_unlocker");
    const fetchSpy = vi.fn(async () => textResponse("# Acme"));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(scrapeUrl("https://acme.com")).resolves.toBe("# Acme");
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      zone: "custom_unlocker",
      url: "https://acme.com",
      format: "raw",
      data_format: "markdown",
    });
  });
});
