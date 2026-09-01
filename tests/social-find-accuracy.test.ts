// Social discovery must never auto-save a same-name stranger. Posts, reserved
// paths, and name-only hits stay unverified. A stolen contact never reaches
// the paid search.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindUnique = vi.fn();
const contactUpdate = vi.fn();
const tavilySearch = vi.fn();
const isTavilyConfigured = vi.fn();
const ensureCredits = vi.fn();
const spendCredits = vi.fn();
const recordProvenanceBulk = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (...args: unknown[]) => contactFindUnique(...args),
      update: (...args: unknown[]) => contactUpdate(...args),
    },
  },
}));
vi.mock("@/lib/tavily", () => ({
  isTavilyConfigured: () => isTavilyConfigured(),
  tavilySearch: (...args: unknown[]) => tavilySearch(...args),
}));
vi.mock("@/lib/credits", () => ({
  ensureCredits: (...args: unknown[]) => ensureCredits(...args),
  spendCredits: (...args: unknown[]) => spendCredits(...args),
}));
vi.mock("@/lib/provenance", () => ({
  recordProvenanceBulk: (...args: unknown[]) => recordProvenanceBulk(...args),
}));

import { findContactSocials } from "@/lib/social-find";

const OWNER = "user-A";

function contact(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    userId: OWNER,
    name: "Ada Lovelace",
    company: "Analytical Engine",
    website: "https://analytical.engine",
    linkedin: null,
    twitter: null,
    instagram: null,
    facebook: null,
    entity: { name: "Analytical Engine", domain: "analytical.engine", website: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isTavilyConfigured.mockReturnValue(true);
  ensureCredits.mockResolvedValue(undefined);
  spendCredits.mockResolvedValue(undefined);
  recordProvenanceBulk.mockResolvedValue(undefined);
  contactUpdate.mockResolvedValue({});
  contactFindUnique.mockResolvedValue(contact());
  tavilySearch.mockResolvedValue([]);
});

describe("findContactSocials — gates", () => {
  it("throws 501 when Tavily is not configured and never reads the contact", async () => {
    isTavilyConfigured.mockReturnValue(false);
    await expect(findContactSocials(OWNER, "c1")).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
    expect(contactFindUnique).not.toHaveBeenCalled();
    expect(ensureCredits).not.toHaveBeenCalled();
  });

  it("throws 404 for a stolen or missing contact and never searches", async () => {
    contactFindUnique.mockResolvedValue({ ...contact(), userId: "user-B" });
    await expect(findContactSocials(OWNER, "c1")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });

    contactFindUnique.mockResolvedValue(null);
    await expect(findContactSocials(OWNER, "c1")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(tavilySearch).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("throws 400 when the contact has no name — we never match without one", async () => {
    contactFindUnique.mockResolvedValue(contact({ name: "" }));
    await expect(findContactSocials(OWNER, "c1")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(tavilySearch).not.toHaveBeenCalled();
  });
});

describe("findContactSocials — accuracy", () => {
  it("does not treat posts or reserved paths as profile URLs", async () => {
    tavilySearch.mockResolvedValue([
      {
        title: "Ada Lovelace at Analytical Engine",
        url: "https://www.linkedin.com/posts/ada-lovelace-123",
        content: "Ada Lovelace Analytical Engine",
      },
      {
        title: "Ada Lovelace at Analytical Engine",
        url: "https://x.com/ada/status/123",
        content: "Ada Lovelace Analytical Engine",
      },
      {
        title: "Ada Lovelace at Analytical Engine",
        url: "https://www.instagram.com/p/abc",
        content: "Ada Lovelace Analytical Engine",
      },
      {
        title: "Ada Lovelace at Analytical Engine",
        url: "https://www.facebook.com/groups/engineers",
        content: "Ada Lovelace Analytical Engine",
      },
    ]);

    const result = await findContactSocials(OWNER, "c1");
    expect(result.candidates).toEqual([]);
    expect(result.saved).toEqual({});
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("does not auto-save a name-only hit (same-name stranger at another company)", async () => {
    tavilySearch.mockResolvedValue([
      {
        title: "Ada Lovelace — Engineer at OtherCorp",
        url: "https://www.linkedin.com/in/ada-other",
        content: "Ada Lovelace works at OtherCorp",
      },
    ]);

    const result = await findContactSocials(OWNER, "c1");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      field: "linkedin",
      nameMatch: true,
      companyMatch: false,
      verified: false,
    });
    expect(result.saved).toEqual({});
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).toHaveBeenCalledTimes(1);
  });

  it("saves only a profile verified against both name and company", async () => {
    tavilySearch.mockResolvedValue([
      {
        title: "Ada Lovelace — Mathematician at Analytical Engine",
        url: "https://www.linkedin.com/in/ada-lovelace",
        content: "Ada Lovelace of Analytical Engine",
      },
    ]);

    const result = await findContactSocials(OWNER, "c1");
    expect(result.saved).toEqual({ linkedin: "https://www.linkedin.com/in/ada-lovelace" });
    expect(result.candidates[0]?.verified).toBe(true);
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { linkedin: "https://www.linkedin.com/in/ada-lovelace" },
    });
  });
});
