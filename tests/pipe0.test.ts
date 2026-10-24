// Pipe0 sync client. The batch API 422s if pipes[0] uses `id` instead of
// `pipe_id`; callers deep-search records/results, so a failed or empty
// payload must not look like enrichment.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findWorkEmail, isPipe0Configured } from "@/lib/pipe0";

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

describe("isPipe0Configured", () => {
  it("treats missing and whitespace keys as unconfigured", () => {
    vi.stubEnv("PIPE0_API_KEY", "");
    expect(isPipe0Configured()).toBe(false);
    vi.stubEnv("PIPE0_API_KEY", "   ");
    expect(isPipe0Configured()).toBe(false);
    vi.stubEnv("PIPE0_API_KEY", "p0-test");
    expect(isPipe0Configured()).toBe(true);
  });

  it("throws before fetch when the key is missing", async () => {
    vi.stubEnv("PIPE0_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(findWorkEmail("Ada", "Lovelace", "acme.com")).rejects.toThrow(
      /PIPE0_API_KEY is not set/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("findWorkEmail", () => {
  beforeEach(() => {
    vi.stubEnv("PIPE0_API_KEY", "p0-test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("POSTs a list of pipes keyed by pipe_id, not id", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ records: [{ email: "ada@acme.com" }] }));
    vi.stubGlobal("fetch", fetchSpy);
    await findWorkEmail("Ada", "Lovelace", "acme.com", "Acme");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.pipe0.com/v1/pipes/run/sync");
    const body = JSON.parse(String(init.body));
    expect(body.pipes).toEqual([{ pipe_id: "people:workemail:waterfall@1" }]);
    expect(body.pipes[0].id).toBeUndefined();
    expect(body.input).toEqual([
      {
        first_name: "Ada",
        last_name: "Lovelace",
        company_domain: "acme.com",
        company_name: "Acme",
      },
    ]);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer p0-test");
  });

  it("prefers records over results, then the raw payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ records: [{ id: "r1" }], results: [{ id: "ignored" }] })));
    await expect(findWorkEmail("Ada", "Lovelace", "acme.com")).resolves.toEqual([{ id: "r1" }]);

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results: [{ id: "s1" }] })));
    await expect(findWorkEmail("Ada", "Lovelace", "acme.com")).resolves.toEqual([{ id: "s1" }]);

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "ok", extra: true })));
    await expect(findWorkEmail("Ada", "Lovelace", "acme.com")).resolves.toEqual({
      status: "ok",
      extra: true,
    });
  });

  it("throws on HTTP failure or status=failed so callers do not persist a miss", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "nope" }, false, 422)));
    await expect(findWorkEmail("Ada", "Lovelace", "acme.com")).rejects.toThrow(/Pipe0 .* failed \(422\)/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "failed", errors: ["provider timeout"] })),
    );
    await expect(findWorkEmail("Ada", "Lovelace", "acme.com")).rejects.toThrow(/provider timeout/);
  });
});
