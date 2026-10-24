// Derived technographics: fingerprints must not invent a stack, SSRF must
// refuse user-writable websites, and a non-owner must never write enrichment.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectTech } from "@/lib/enrich/technographics";

const { entityFindUnique, entityUpdate } = vi.hoisted(() => ({
  entityFindUnique: vi.fn(),
  entityUpdate: vi.fn(),
}));
const { recordProvenance } = vi.hoisted(() => ({ recordProvenance: vi.fn() }));
const { safeHttpUrl, resolvesToPublicIp } = vi.hoisted(() => ({
  safeHttpUrl: vi.fn(),
  resolvesToPublicIp: vi.fn(),
}));
const { fetchWithTimeout } = vi.hoisted(() => ({ fetchWithTimeout: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    entity: {
      findUnique: (...a: unknown[]) => entityFindUnique(...a),
      update: (...a: unknown[]) => entityUpdate(...a),
    },
  },
}));
vi.mock("@/lib/provenance", () => ({
  recordProvenance,
  CONFIDENCE: { derived: 70 },
}));
vi.mock("@/lib/ssrf", () => ({ safeHttpUrl, resolvesToPublicIp }));
vi.mock("@/lib/http", () => ({ fetchWithTimeout }));

import { detectEntityTech, detectSiteTech } from "@/lib/enrich/technographics";

describe("detectTech", () => {
  it("matches Shopify, Next.js, and Cloudflare from html/headers", () => {
    const found = detectTech(
      `<script src="https://cdn.shopify.com/s.js"></script><script src="/_next/static/chunks/x.js"></script>`,
      { "x-shopid": "1", "x-powered-by": "Next.js", server: "cloudflare", "cf-ray": "abc" },
    );
    const names = found.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Shopify", "Next.js", "Cloudflare"]));
  });

  it("does not invent technologies from unrelated html", () => {
    expect(detectTech("<html><body>Hello Acme</body></html>")).toEqual([]);
  });

  it("requires lowercase header keys (the fetch path lowercases them)", () => {
    expect(detectTech("", { "X-Powered-By": "Next.js" }).map((t) => t.name)).not.toContain("Next.js");
    expect(detectTech("", { "x-powered-by": "Next.js" }).map((t) => t.name)).toContain("Next.js");
  });
});

describe("detectSiteTech - SSRF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    safeHttpUrl.mockReturnValue(null);
    resolvesToPublicIp.mockResolvedValue(false);
  });

  it("returns [] and never fetches a blocked or private URL", async () => {
    await expect(detectSiteTech("http://169.254.169.254/latest/meta-data")).resolves.toEqual([]);
    expect(fetchWithTimeout).not.toHaveBeenCalled();

    safeHttpUrl.mockReturnValue(new URL("https://internal.example"));
    resolvesToPublicIp.mockResolvedValue(false);
    await expect(detectSiteTech("https://internal.example")).resolves.toEqual([]);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});

describe("detectEntityTech - isolation and empty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entityFindUnique.mockResolvedValue({
      id: "e1",
      userId: "user-ada",
      name: "Acme",
      website: "https://acme.com",
      domain: "acme.com",
      enrichment: { legal: { lei: "x" } },
    });
    entityUpdate.mockResolvedValue({ id: "e1", name: "Acme" });
    recordProvenance.mockResolvedValue(undefined);
    safeHttpUrl.mockReturnValue(new URL("https://acme.com"));
    resolvesToPublicIp.mockResolvedValue(true);
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      text: async () => "<html></html>",
      headers: { forEach: () => {} },
    });
  });

  it("404s for a non-owner and never fetches or updates", async () => {
    await expect(detectEntityTech("user-eve", "e1")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(entityUpdate).not.toHaveBeenCalled();
    expect(recordProvenance).not.toHaveBeenCalled();
  });

  it("does not write when no technologies are detected", async () => {
    await expect(detectEntityTech("user-ada", "e1")).resolves.toEqual({
      id: "e1",
      name: "Acme",
      tech: [],
    });
    expect(entityUpdate).not.toHaveBeenCalled();
    expect(recordProvenance).not.toHaveBeenCalled();
  });

  it("merges tech into existing enrichment on a hit", async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      text: async () => `<script src="https://js.stripe.com/v3"></script>`,
      headers: { forEach: (fn: (v: string, k: string) => void) => fn("abc", "x-vercel-id") },
    });

    const result = await detectEntityTech("user-ada", "e1");
    expect(result.tech.map((t) => t.name)).toEqual(expect.arrayContaining(["Stripe", "Vercel"]));
    expect(entityUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        enrichment: expect.objectContaining({
          legal: { lei: "x" },
          tech: expect.arrayContaining([
            expect.objectContaining({ name: "Stripe" }),
            expect.objectContaining({ name: "Vercel" }),
          ]),
        }),
      },
    });
  });
});
