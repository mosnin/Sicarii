// Tavily search/extract/crawl parsing. Empty or failed upstream payloads
// must degrade to [] / failed rows, never throw a shape error into MCP search.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTavilyConfigured,
  tavilyCrawl,
  tavilyExtract,
  tavilySearch,
  TavilyNotConfiguredError,
} from "@/lib/tavily";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isTavilyConfigured", () => {
  it("is off without a key and throws before fetch", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isTavilyConfigured()).toBe(false);
    await expect(tavilySearch("dentists miami")).rejects.toBeInstanceOf(TavilyNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("tavilySearch", () => {
  beforeEach(() => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
  });

  it("returns [] when results is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    await expect(tavilySearch("nail salons")).resolves.toEqual([]);
  });

  it("caps max_results at 20 even if the caller asks for more", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchSpy);
    await tavilySearch("q", { maxResults: 99 });
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.max_results).toBe(20);
    expect(body.api_key).toBe("tvly-test");
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "quota" }, false, 429)));
    await expect(tavilySearch("q")).rejects.toThrow(/Tavily search failed \(429\)/);
  });
});

describe("tavilyExtract", () => {
  beforeEach(() => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
  });

  it("appends failed_results as failed rows with empty content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [{ url: "https://ok.example", rawContent: "hello" }],
          failed_results: [{ url: "https://blocked.example" }],
        }),
      ),
    );
    await expect(tavilyExtract(["https://ok.example", "https://blocked.example"])).resolves.toEqual([
      { url: "https://ok.example", rawContent: "hello" },
      { url: "https://blocked.example", rawContent: "", failed: true },
    ]);
  });
});

describe("tavilyCrawl", () => {
  beforeEach(() => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
  });

  it("maps raw_content onto rawContent and falls back to the requested url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [{ url: "https://acme.com/about", raw_content: "About Acme" }],
        }),
      ),
    );
    await expect(tavilyCrawl("https://acme.com")).resolves.toEqual({
      baseUrl: "https://acme.com",
      results: [{ url: "https://acme.com/about", rawContent: "About Acme" }],
    });
  });
});
