// Outbound task webhooks: a user-supplied URL must never be fetched when the
// SSRF guard rejects it, and a thrown POST must not escape the job.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { safeHttpUrl, resolvesToPublicIp } = vi.hoisted(() => ({
  safeHttpUrl: vi.fn(),
  resolvesToPublicIp: vi.fn(),
}));

vi.mock("@/lib/ssrf", () => ({ safeHttpUrl, resolvesToPublicIp }));

import { notifyTaskWebhook, type TaskWebhookPayload } from "@/lib/notify";

const payload: TaskWebhookPayload = {
  event: "intent-monitor.completed",
  taskId: "t1",
  name: "watch",
  query: "acme",
  created: 1,
  items: [],
  completedAt: "2026-08-26T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifyTaskWebhook", () => {
  it("does not fetch when the URL is blocked or missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeHttpUrl.mockReturnValue(null);

    await notifyTaskWebhook("http://localhost/hook", payload);
    await notifyTaskWebhook(null, payload);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resolvesToPublicIp).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("does not fetch when the hostname resolves privately", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeHttpUrl.mockReturnValue(new URL("https://hooks.example.com/x"));
    resolvesToPublicIp.mockResolvedValue(false);

    await notifyTaskWebhook("https://hooks.example.com/x", payload);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("swallows a thrown POST so a bad subscriber cannot fail the job", async () => {
    safeHttpUrl.mockReturnValue(new URL("https://hooks.example.com/x"));
    resolvesToPublicIp.mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(notifyTaskWebhook("https://hooks.example.com/x", payload)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("POSTs JSON to a public https URL", async () => {
    safeHttpUrl.mockReturnValue(new URL("https://hooks.example.com/x"));
    resolvesToPublicIp.mockResolvedValue(true);
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await notifyTaskWebhook("https://hooks.example.com/x", payload);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hooks.example.com/x",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      }),
    );
  });
});
