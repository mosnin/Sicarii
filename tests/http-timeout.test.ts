// Hung providers must not pin a serverless instance. fetchWithTimeout always
// attaches a timeout abort signal, and must not overwrite a caller-supplied one.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithTimeout } from "@/lib/http";

describe("fetchWithTimeout", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("passes the URL and attaches a default 30s timeout signal", async () => {
    await fetchWithTimeout("https://api.example.com/x", { method: "POST" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.example.com/x");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves a caller-supplied signal instead of replacing it", async () => {
    const controller = new AbortController();
    await fetchWithTimeout("https://api.example.com/x", { signal: controller.signal }, 5_000);
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.signal).toBe(controller.signal);
  });
});
