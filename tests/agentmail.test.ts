// AgentMail thread listing is best-effort over two envelope shapes
// (inboxes/data, threads/data). An empty contact email must never fan out
// inbox fetches; a missing inbox id must be skipped; the max cap is the
// last line of defense against dumping the whole mailbox onto a CRM page.
import { describe, it, expect, vi, afterEach } from "vitest";
import { getThreadsForContact, isAgentMailConfigured } from "@/lib/agentmail";

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
  vi.restoreAllMocks();
});

describe("isAgentMailConfigured", () => {
  it("is false for empty/missing keys, true for a real one", () => {
    expect(isAgentMailConfigured(undefined)).toBe(false);
    expect(isAgentMailConfigured(null)).toBe(false);
    expect(isAgentMailConfigured("")).toBe(false);
    expect(isAgentMailConfigured("   ")).toBe(false);
    expect(isAgentMailConfigured("am_live_abc")).toBe(true);
  });
});

describe("getThreadsForContact", () => {
  it("returns [] and never fetches for an empty email", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(getThreadsForContact("am_live", "")).resolves.toEqual([]);
    await expect(getThreadsForContact("am_live", "   ")).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads inboxes from either inboxes or data, and skips rows without an id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/inboxes")) {
        return jsonResponse({
          inboxes: [{ name: "no-id" }, { inbox_id: "in_1", email_address: "me@x.com" }],
        });
      }
      return jsonResponse({
        threads: [
          {
            thread_id: "th_1",
            subject: "Hello",
            updated_at: "2026-08-01T00:00:00Z",
            last_message: { from: "ada@acme.com", text: "hi" },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const threads = await getThreadsForContact("am_live", "ada@acme.com");
    expect(threads).toEqual([
      expect.objectContaining({
        id: "th_1",
        subject: "Hello",
        from: "ada@acme.com",
      }),
    ]);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("https://api.agentmail.to/v0/inboxes");
    expect(urls.some((u) => u.includes("/inboxes/in_1/threads"))).toBe(true);
    expect(urls.some((u) => u.includes("/inboxes/no-id/"))).toBe(false);
  });

  it("falls back to the data envelope for inboxes and threads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/inboxes")) {
          return jsonResponse({ data: [{ id: "in_2" }] });
        }
        return jsonResponse({
          data: [{ id: "th_2", subject: "Ping", from: "ada@acme.com" }],
        });
      }),
    );

    const threads = await getThreadsForContact("am_live", "ada@acme.com");
    expect(threads.map((t) => t.id)).toEqual(["th_2"]);
  });

  it("drops threads without an id and honors the max cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/inboxes")) {
          return jsonResponse({ inboxes: [{ id: "in_1" }] });
        }
        return jsonResponse({
          threads: [
            { subject: "no id", from: "ada@acme.com" },
            { id: "th_a", subject: "A", updated_at: "2026-08-02T00:00:00Z", from: "ada@acme.com" },
            { id: "th_b", subject: "B", updated_at: "2026-08-03T00:00:00Z", from: "ada@acme.com" },
            { id: "th_c", subject: "C", updated_at: "2026-08-01T00:00:00Z", from: "ada@acme.com" },
          ],
        });
      }),
    );

    const threads = await getThreadsForContact("am_live", "ada@acme.com", 2);
    expect(threads.map((t) => t.id)).toEqual(["th_b", "th_a"]);
  });

  it("continues when one inbox thread list fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/inboxes")) {
          return jsonResponse({ inboxes: [{ id: "bad" }, { id: "good" }] });
        }
        if (url.includes("/inboxes/bad/")) {
          return jsonResponse({ error: "nope" }, false, 500);
        }
        return jsonResponse({
          threads: [{ id: "th_ok", subject: "ok", from: "ada@acme.com" }],
        });
      }),
    );

    const threads = await getThreadsForContact("am_live", "ada@acme.com");
    expect(threads.map((t) => t.id)).toEqual(["th_ok"]);
  });
});
