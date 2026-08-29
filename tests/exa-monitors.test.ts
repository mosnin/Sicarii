// Exa monitor + search clients. A wrong list envelope silently hides every
// scheduled monitor; a missing results key turns a successful search into
// "no leads". These tests pin the response shapes the rest of the app trusts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listExaMonitors,
  createExaMonitor,
  deleteExaMonitor,
  exaIntentSearch,
  isExaConfigured,
} from "@/lib/exa";

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

describe("isExaConfigured / key gate", () => {
  it("is off without a key and list/create throw before fetch", async () => {
    vi.stubEnv("EXA_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isExaConfigured()).toBe(false);
    await expect(listExaMonitors()).rejects.toThrow(/EXA_API_KEY is not set/);
    await expect(
      createExaMonitor({ query: "q", webhookUrl: "https://example.com/hook" }),
    ).rejects.toThrow(/EXA_API_KEY is not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("listExaMonitors envelopes", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
  });

  it("reads the monitors envelope", async () => {
    const monitors = [{ id: "m1", query: "dentists miami" }];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ monitors })));
    await expect(listExaMonitors()).resolves.toEqual(monitors);
  });

  it("falls back to a data envelope when monitors is absent", async () => {
    const data = [{ id: "m2", query: "series A fintech" }];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data })));
    await expect(listExaMonitors()).resolves.toEqual(data);
  });

  it("returns [] when neither envelope is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    await expect(listExaMonitors()).resolves.toEqual([]);
  });

  it("throws on a non-ok response so callers do not treat a 5xx as empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "nope" }, false, 502)));
    await expect(listExaMonitors()).rejects.toThrow(/Exa list monitors failed \(502\)/);
  });
});

describe("createExaMonitor / deleteExaMonitor", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
  });

  it("POSTs neural defaults and the caller webhook", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "mon_1" }));
    vi.stubGlobal("fetch", fetchMock);

    const created = await createExaMonitor({
      query: "in-market HVAC",
      webhookUrl: "https://app.example/api/webhooks/exa?t=tok",
    });
    expect(created).toEqual({ id: "mon_1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.exa.ai/monitors",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "exa-test" }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      query: "in-market HVAC",
      type: "neural",
      webhookUrl: "https://app.example/api/webhooks/exa?t=tok",
      runEvery: "day",
      numResults: 10,
    });
  });

  it("DELETEs the monitor id", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, true, 204));
    vi.stubGlobal("fetch", fetchMock);
    await deleteExaMonitor("mon_9");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.exa.ai/monitors/mon_9",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "x-api-key": "exa-test" }),
      }),
    );
  });
});

describe("exaIntentSearch", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
  });

  it("returns [] when the payload has no results key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    await expect(exaIntentSearch("who is buying")).resolves.toEqual([]);
  });

  it("only attaches contents when a content flag is set", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await exaIntentSearch("q", { numResults: 4, category: "company" });
    const bare = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(bare.contents).toBeUndefined();
    expect(bare.numResults).toBe(4);
    expect(bare.category).toBe("company");

    await exaIntentSearch("q", { includeText: true, includeHighlights: true, includeSummary: true });
    const rich = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(rich.contents).toEqual({
      text: { maxCharacters: 800 },
      highlights: { numSentences: 3, highlightsPerUrl: 3 },
      summary: { query: "q" },
    });
  });

  it("throws on a failed search so a 5xx is not an empty result set", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "quota" }, false, 429)));
    await expect(exaIntentSearch("q")).rejects.toThrow(/Exa \/search failed \(429\)/);
  });
});
