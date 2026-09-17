// detectTech fingerprints a public homepage into a tech stack that is then
// written onto Entity.enrichment.tech (REST + MCP detect_tech). A loose
// regex attaches the wrong stack to a live company; a missing ownership
// check lets one tenant overwrite another's enrichment. detectSiteTech must
// also refuse internal hosts so an agent-writable website field cannot be
// turned into an SSRF probe.
//
// detectTech is pure. detectEntityTech / detectSiteTech mock prisma, fetch,
// and provenance. No live network.

import { describe, it, expect, vi, beforeEach } from "vitest";

const entityFindUnique = vi.fn();
const entityUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      findUnique: (...args: unknown[]) => entityFindUnique(...args),
      update: (...args: unknown[]) => entityUpdate(...args),
    },
  },
}));

const fetchWithTimeout = vi.fn();
vi.mock("@/lib/http", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

// Keep the real host blocklist; skip live DNS so detectEntityTech stays
// deterministic in CI (acme.com must not depend on a resolver).
vi.mock("@/lib/ssrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf")>();
  return {
    ...actual,
    resolvesToPublicIp: vi.fn(async () => true),
  };
});

const recordProvenance = vi.fn();
vi.mock("@/lib/provenance", () => ({
  recordProvenance: (...args: unknown[]) => recordProvenance(...args),
  CONFIDENCE: { derived: 0.7 },
}));

import { detectTech, detectSiteTech, detectEntityTech } from "@/lib/enrich/technographics";

const USER = "user-1";
const ATTACKER = "user-2";

describe("detectTech fingerprints", () => {
  it("returns nothing for empty or unrelated HTML", () => {
    expect(detectTech("")).toEqual([]);
    expect(detectTech("<html><body>Hello world</body></html>")).toEqual([]);
  });

  it("detects Shopify, WordPress, Next.js, and Stripe from public markup", () => {
    const html = `
      <script src="https://cdn.shopify.com/s/files/1/x.js"></script>
      <link href="/wp-content/themes/x/style.css" />
      <script src="/_next/static/chunks/main.js"></script>
      <script src="https://js.stripe.com/v3/"></script>
    `;
    const names = detectTech(html).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Shopify", "WordPress", "Next.js", "Stripe"]));
  });

  it("detects Cloudflare / Vercel from response headers alone", () => {
    const names = detectTech("<html></html>", {
      server: "cloudflare",
      "cf-ray": "abc",
      "x-vercel-id": "sfo1::1",
    }).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Cloudflare", "Vercel"]));
  });

  it("looks up headers by lowercase name (detectSiteTech lowercases before calling)", () => {
    expect(detectTech("", { "x-powered-by": "Next.js" }).map((t) => t.name)).toContain("Next.js");
    expect(detectTech("", { "X-POWERED-BY": "Next.js" })).toEqual([]);
  });

  it("does not treat a same-name stranger string as a hit (HubSpot needs the script host)", () => {
    const names = detectTech("We love HubSpot and Salesforce as products.").map((t) => t.name);
    expect(names).not.toContain("HubSpot");
    expect(names).not.toContain("Salesforce");
  });
});

describe("detectSiteTech SSRF fence", () => {
  beforeEach(() => fetchWithTimeout.mockReset());

  it("returns [] and never fetches localhost, private IPs, or plain HTTP", async () => {
    for (const url of [
      "http://example.com",
      "https://localhost/admin",
      "https://127.0.0.1/",
      "https://169.254.169.254/latest/meta-data",
      "https://192.168.1.1/",
    ]) {
      await expect(detectSiteTech(url)).resolves.toEqual([]);
    }
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});

describe("detectEntityTech ownership and merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entityFindUnique.mockResolvedValue({
      id: "e1",
      userId: USER,
      name: "Acme",
      website: "https://acme.com",
      domain: "acme.com",
      enrichment: { employees: 12 },
    });
    entityUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "e1",
      name: "Acme",
      ...data,
    }));
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      text: async () => '<script src="https://js.stripe.com/v3/"></script>',
      headers: { forEach: (fn: (v: string, k: string) => void) => fn("sfo1::1", "x-vercel-id") },
    });
    recordProvenance.mockResolvedValue(undefined);
  });

  it("denies a non-owner and never writes enrichment", async () => {
    await expect(detectEntityTech(ATTACKER, "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(entityUpdate).not.toHaveBeenCalled();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(recordProvenance).not.toHaveBeenCalled();
  });

  it("throws 400 when the entity has no website or domain, and never fetches", async () => {
    entityFindUnique.mockResolvedValue({
      id: "e1",
      userId: USER,
      name: "Acme",
      website: null,
      domain: null,
      enrichment: null,
    });
    await expect(detectEntityTech(USER, "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(entityUpdate).not.toHaveBeenCalled();
  });

  it("merges tech into existing enrichment without wiping other keys", async () => {
    const result = await detectEntityTech(USER, "e1");
    expect(result.tech.map((t) => t.name)).toEqual(expect.arrayContaining(["Stripe", "Vercel"]));
    const written = entityUpdate.mock.calls[0][0].data.enrichment as {
      employees: number;
      tech: { name: string }[];
    };
    expect(written.employees).toBe(12);
    expect(written.tech.map((t) => t.name)).toEqual(expect.arrayContaining(["Stripe", "Vercel"]));
    expect(recordProvenance).toHaveBeenCalledTimes(1);
  });

  it("lowercases response headers before fingerprinting so X-Vercel-Id still matches", async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      text: async () => "<html></html>",
      headers: { forEach: (fn: (v: string, k: string) => void) => fn("sfo1::1", "X-Vercel-Id") },
    });
    const result = await detectEntityTech(USER, "e1");
    expect(result.tech.map((t) => t.name)).toContain("Vercel");
  });

  it("does not write when the site yields no fingerprints (a miss is free and silent)", async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      text: async () => "<html><body>nothing</body></html>",
      headers: { forEach: () => undefined },
    });
    const result = await detectEntityTech(USER, "e1");
    expect(result.tech).toEqual([]);
    expect(entityUpdate).not.toHaveBeenCalled();
    expect(recordProvenance).not.toHaveBeenCalled();
  });
});
