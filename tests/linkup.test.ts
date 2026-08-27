// Linkup search result mapping. Deep research and standard search share one
// parser: sources must come from results or sources, never a thrown shape miss.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isLinkupConfigured, linkupDeepResearch, linkupSearch } from "@/lib/linkup";

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

describe("isLinkupConfigured", () => {
  it("is unconfigured without a key and never fetches", async () => {
    vi.stubEnv("LINKUP_API_KEY", "   ");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isLinkupConfigured()).toBe(false);
    await expect(linkupSearch("acme competitors")).rejects.toThrow(/LINKUP_API_KEY is not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("linkupSearch", () => {
  beforeEach(() => {
    vi.stubEnv("LINKUP_API_KEY", "lu-test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("maps results[].name/content onto title/snippet", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        results: [{ url: "https://acme.com", name: "Acme", content: "Sells nails" }],
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await expect(linkupSearch("nail salons miami")).resolves.toEqual({
      answer: undefined,
      sources: [{ url: "https://acme.com", title: "Acme", snippet: "Sells nails" }],
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.linkup.so/v1/search");
    expect(JSON.parse(String(init.body))).toEqual({
      q: "nail salons miami",
      depth: "standard",
      outputType: "searchResults",
    });
  });

  it("falls back to sources[] and empty url when a row has no url", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        answer: "Acme is a salon.",
        sources: [{ name: "Untitled", snippet: "note" }],
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await expect(linkupDeepResearch("what is acme")).resolves.toEqual({
      answer: "Acme is a salon.",
      sources: [{ url: "", title: "Untitled", snippet: "note" }],
    });
    expect(JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      q: "what is acme",
      depth: "deep",
      outputType: "sourcedAnswer",
    });
  });

  it("throws on HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "nope" }, false, 401)));
    await expect(linkupSearch("q")).rejects.toThrow(/Linkup search failed \(401\)/);
  });
});
