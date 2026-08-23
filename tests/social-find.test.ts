// Social profile discovery (PR #41): never auto-save a same-name stranger.
// A profile is saved only when the result matches the contact's full name AND
// their company (or domain). Anything less stays a candidate.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindUnique = vi.fn();
const contactUpdate = vi.fn().mockResolvedValue({});
const tavilySearch = vi.fn();
const isTavilyConfigured = vi.fn(() => true);
const ensureCredits = vi.fn().mockResolvedValue(undefined);
const spendCredits = vi.fn().mockResolvedValue(undefined);
const recordProvenanceBulk = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (...args: unknown[]) => contactFindUnique(...args),
      update: (...args: unknown[]) => contactUpdate(...args),
    },
  },
}));

vi.mock("@/lib/tavily", () => ({
  tavilySearch: (...args: unknown[]) => tavilySearch(...args),
  isTavilyConfigured: (...args: unknown[]) => isTavilyConfigured(...args),
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
const ATTACKER = "user-B";
const CONTACT_ID = "c1";

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    userId: OWNER,
    name: "Jordan Lee",
    company: "Acme Co",
    website: "https://acme.com",
    linkedin: null,
    twitter: null,
    instagram: null,
    facebook: null,
    entity: { name: "Acme Co", domain: "acme.com", website: "https://acme.com" },
    ...overrides,
  };
}

beforeEach(() => {
  contactFindUnique.mockReset();
  contactUpdate.mockClear();
  tavilySearch.mockReset();
  isTavilyConfigured.mockReset();
  isTavilyConfigured.mockReturnValue(true);
  ensureCredits.mockClear();
  spendCredits.mockClear();
  recordProvenanceBulk.mockClear();
  contactFindUnique.mockResolvedValue(contact());
  tavilySearch.mockResolvedValue([]);
});

describe("findContactSocials access and preconditions", () => {
  it("denies a non-owner before searching or charging", async () => {
    contactFindUnique.mockResolvedValue(contact({ userId: OWNER }));
    await expect(findContactSocials(ATTACKER, CONTACT_ID)).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(tavilySearch).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("refuses to match without a name", async () => {
    contactFindUnique.mockResolvedValue(contact({ name: "" }));
    await expect(findContactSocials(OWNER, CONTACT_ID)).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(tavilySearch).not.toHaveBeenCalled();
  });

  it("fails closed when Tavily is not configured", async () => {
    isTavilyConfigured.mockReturnValue(false);
    await expect(findContactSocials(OWNER, CONTACT_ID)).rejects.toMatchObject({
      name: "OpError",
      status: 501,
    });
  });
});

describe("findContactSocials verification rule", () => {
  it("does not save a name-only LinkedIn hit (same-name stranger)", async () => {
    tavilySearch.mockResolvedValue([
      {
        title: "Jordan Lee - Investor",
        url: "https://www.linkedin.com/in/jordan-lee",
        content: "Jordan Lee is an investor in Berlin.",
      },
    ]);

    const result = await findContactSocials(OWNER, CONTACT_ID);
    expect(result.saved).toEqual({});
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      field: "linkedin",
      nameMatch: true,
      companyMatch: false,
      verified: false,
    });
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).toHaveBeenCalledWith(OWNER, "find_socials", { ref: CONTACT_ID });
  });

  it("saves only when name and company both match, and ignores posts / company pages", async () => {
    tavilySearch.mockResolvedValue([
      {
        title: "Jordan Lee | Acme Co",
        url: "https://www.linkedin.com/in/jordanlee",
        content: "VP Sales at Acme Co.",
      },
      {
        title: "Jordan Lee at Acme Co",
        url: "https://www.linkedin.com/posts/someone-activity-1",
        content: "A post, not a profile.",
      },
      {
        title: "Acme Co",
        url: "https://www.linkedin.com/company/acme",
        content: "Company page.",
      },
      {
        title: "Jordan Lee on X",
        url: "https://x.com/jordanlee/status/123",
        content: "A tweet from Jordan Lee at Acme Co.",
      },
    ]);

    const result = await findContactSocials(OWNER, CONTACT_ID);
    expect(result.saved).toEqual({ linkedin: "https://www.linkedin.com/in/jordanlee" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].verified).toBe(true);
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: { linkedin: "https://www.linkedin.com/in/jordanlee" },
    });
    expect(recordProvenanceBulk).toHaveBeenCalled();
  });

  it("does not overwrite a social field that is already set", async () => {
    contactFindUnique.mockResolvedValue(contact({ linkedin: "https://linkedin.com/in/already" }));
    tavilySearch.mockResolvedValue([
      {
        title: "Jordan Lee | Acme Co",
        url: "https://www.linkedin.com/in/other",
        content: "Jordan Lee at Acme Co",
      },
    ]);

    const result = await findContactSocials(OWNER, CONTACT_ID);
    expect(result.saved).toEqual({});
    expect(result.candidates).toEqual([]);
    expect(contactUpdate).not.toHaveBeenCalled();
  });

  it("does not charge when the search returns nothing usable", async () => {
    tavilySearch.mockResolvedValue([
      { title: "Unrelated", url: "https://example.com/about", content: "No profiles here." },
    ]);

    const result = await findContactSocials(OWNER, CONTACT_ID);
    expect(result.saved).toEqual({});
    expect(result.candidates).toEqual([]);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });

  it("treats a company-domain match as company evidence", async () => {
    tavilySearch.mockResolvedValue([
      {
        title: "Jordan Lee",
        url: "https://x.com/jordanlee",
        content: "Personal site mentions acme.com",
      },
    ]);

    const result = await findContactSocials(OWNER, CONTACT_ID);
    expect(result.candidates[0]).toMatchObject({
      field: "twitter",
      nameMatch: true,
      companyMatch: true,
      verified: true,
    });
    expect(result.saved.twitter).toBe("https://x.com/jordanlee");
  });
});
