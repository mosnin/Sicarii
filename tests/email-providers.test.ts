// Finder/verifier response parsing. The waterfall only sees a string or a
// verdict; these tests pin the clients so a shape change cannot silently
// attach a non-email, a catch-all, or a paid miss.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { anymailfinderFind, isAnymailfinderConfigured } from "@/lib/providers/anymailfinder";
import { findymailFind, isFindymailConfigured } from "@/lib/providers/findymail";
import { bouncerVerify, isBouncerConfigured } from "@/lib/providers/bouncer";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("anymailfinderFind", () => {
  beforeEach(() => {
    vi.stubEnv("ANYMAILFINDER_API_KEY", "amf-test");
  });

  it("is unconfigured without a key and never fetches", async () => {
    vi.stubEnv("ANYMAILFINDER_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isAnymailfinderConfigured()).toBe(false);
    await expect(anymailfinderFind({ fullName: "Ada", domain: "a.com" })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads results.email or a top-level email and lowercases it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results: { email: "Ada@Acme.COM" } })));
    await expect(anymailfinderFind({ fullName: "Ada", domain: "acme.com" })).resolves.toBe(
      "ada@acme.com",
    );

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ email: "ada@acme.com" })));
    await expect(anymailfinderFind({ fullName: "Ada", domain: "acme.com" })).resolves.toBe(
      "ada@acme.com",
    );
  });

  it("returns null for a 404, a missing @, or invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "not found" }, false)));
    await expect(anymailfinderFind({ fullName: "Ada", domain: "acme.com" })).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ email: "not-an-email" })));
    await expect(anymailfinderFind({ fullName: "Ada", domain: "acme.com" })).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("bad json");
          },
        }) as unknown as Response,
      ),
    );
    await expect(anymailfinderFind({ fullName: "Ada", domain: "acme.com" })).resolves.toBeNull();
  });
});

describe("findymailFind", () => {
  beforeEach(() => {
    vi.stubEnv("FINDYMAIL_API_KEY", "fy-test");
  });

  it("is unconfigured without a key and never fetches", async () => {
    vi.stubEnv("FINDYMAIL_API_KEY", "   ");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isFindymailConfigured()).toBe(false);
    await expect(findymailFind({ name: "Ada", domain: "a.com" })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prefers contact.email over a top-level email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ contact: { email: "Ada@Acme.COM" }, email: "other@x.com" })),
    );
    await expect(findymailFind({ name: "Ada", domain: "acme.com" })).resolves.toBe("ada@acme.com");
  });

  it("returns null when the network throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("timeout");
    }));
    await expect(findymailFind({ name: "Ada", domain: "acme.com" })).resolves.toBeNull();
  });
});

describe("bouncerVerify", () => {
  beforeEach(() => {
    vi.stubEnv("BOUNCER_API_KEY", "bn-test");
  });

  it("returns unknown without a key and never fetches", async () => {
    vi.stubEnv("BOUNCER_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(isBouncerConfigured()).toBe(false);
    await expect(bouncerVerify("ada@acme.com")).resolves.toBe("unknown");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("downgrades a deliverable catch-all domain to risky", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "deliverable", domain: { acceptAll: "yes" } })),
    );
    await expect(bouncerVerify("ada@acme.com")).resolves.toBe("risky");
  });

  it("passes through deliverable / risky / undeliverable and maps everything else to unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "deliverable" })));
    await expect(bouncerVerify("ada@acme.com")).resolves.toBe("deliverable");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "risky" })));
    await expect(bouncerVerify("ada@acme.com")).resolves.toBe("risky");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "undeliverable" })));
    await expect(bouncerVerify("ada@acme.com")).resolves.toBe("undeliverable");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "unknown-status" })));
    await expect(bouncerVerify("ada@acme.com")).resolves.toBe("unknown");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "nope" }, false)));
    await expect(bouncerVerify("ada@acme.com")).resolves.toBe("unknown");
  });
});
