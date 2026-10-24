// Hung providers must abort before the serverless wall clock. fetchWithTimeout
// is the one place that guarantee lives — a missing timeout reopens the
// cascade-504 failure mode documented in src/lib/http.ts.
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout } from "@/lib/http";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchWithTimeout", () => {
  it("uses AbortSignal.timeout(30s) when the caller did not pass a signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("https://provider.example/v1", {
      headers: { Authorization: "Bearer k" },
    });

    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/v1",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("honors an explicit timeoutMs", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));

    await fetchWithTimeout("https://provider.example/v1", {}, 5_000);
    expect(timeout).toHaveBeenCalledWith(5_000);
  });

  it("preserves a caller-supplied signal and does not wrap it", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const existing = new AbortController().signal;

    await fetchWithTimeout("https://provider.example/v1", { signal: existing });

    expect(timeout).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].signal).toBe(existing);
  });
});
