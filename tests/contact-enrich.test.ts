// Contact enrichment accuracy: never attach a same-name stranger, a
// guessed company, or an off-domain email. A wrong value here poisons the
// CRM and every sequence that follows. Credits must gate before paid
// lookups and debit only on a real hit.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { contactFindUnique, contactUpdate } = vi.hoisted(() => ({
  contactFindUnique: vi.fn(),
  contactUpdate: vi.fn(),
}));
const { ensureCredits, spendCredits, callOrder } = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    ensureCredits: vi.fn(async () => {
      callOrder.push("ensureCredits");
    }),
    spendCredits: vi.fn(async () => {
      callOrder.push("spendCredits");
    }),
  };
});
const {
  isExaConfigured,
  exaFindLinkedIn,
  isPipe0Configured,
  findWorkEmail,
  findMobile,
  isExploriumConfigured,
  getPeopleAtCompany,
  isEmailWaterfallConfigured,
  findVerifiedEmail,
  recordProvenance,
} = vi.hoisted(() => ({
  isExaConfigured: vi.fn(),
  exaFindLinkedIn: vi.fn(),
  isPipe0Configured: vi.fn(),
  findWorkEmail: vi.fn(),
  findMobile: vi.fn(),
  isExploriumConfigured: vi.fn(),
  getPeopleAtCompany: vi.fn(),
  isEmailWaterfallConfigured: vi.fn(),
  findVerifiedEmail: vi.fn(),
  recordProvenance: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (...a: unknown[]) => contactFindUnique(...a),
      update: (...a: unknown[]) => contactUpdate(...a),
    },
  },
}));
vi.mock("@/lib/credits", () => ({ ensureCredits, spendCredits }));
vi.mock("@/lib/exa", () => ({ isExaConfigured, exaFindLinkedIn }));
vi.mock("@/lib/pipe0", () => ({ isPipe0Configured, findWorkEmail, findMobile }));
vi.mock("@/lib/explorium", () => ({ isExploriumConfigured, getPeopleAtCompany }));
vi.mock("@/lib/enrich/email-waterfall", () => ({
  isEmailWaterfallConfigured,
  findVerifiedEmail,
}));
vi.mock("@/lib/provenance", () => ({
  recordProvenance,
  CONFIDENCE: {
    exa: 75,
    pipe0: 85,
    explorium: 90,
    anymailfinder: 80,
    findymail: 80,
  },
}));

import { enrichContactField } from "@/lib/contact-enrich";
import { OpError } from "@/lib/crm-operations";

const OWNER = "user-ada";
const BASE_CONTACT = {
  id: "c1",
  userId: OWNER,
  status: "NEW",
  name: "Ada Lovelace",
  company: "Analytical Engines",
  title: "Mathematician",
  location: "London",
  website: null,
  email: null,
  linkedin: null,
  phone: null,
  entity: { domain: "analytical.com", website: "https://analytical.com", name: "Analytical" },
};

function contact(overrides: Record<string, unknown> = {}) {
  return { ...BASE_CONTACT, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  contactFindUnique.mockResolvedValue(contact());
  contactUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...contact(),
    ...data,
  }));
  isExaConfigured.mockReturnValue(false);
  isPipe0Configured.mockReturnValue(false);
  isExploriumConfigured.mockReturnValue(false);
  isEmailWaterfallConfigured.mockReturnValue(true);
  exaFindLinkedIn.mockResolvedValue(null);
  findWorkEmail.mockResolvedValue(null);
  findMobile.mockResolvedValue(null);
  getPeopleAtCompany.mockResolvedValue([]);
  findVerifiedEmail.mockResolvedValue(null);
  recordProvenance.mockResolvedValue(undefined);
});

describe("enrichContactField - access and gates", () => {
  it("404s for a non-owner and never spends or calls a provider", async () => {
    await expect(enrichContactField("user-eve", "c1", "email")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(findVerifiedEmail).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("returns without debiting when the field is already set", async () => {
    contactFindUnique.mockResolvedValue(contact({ email: "ada@analytical.com" }));

    const result = await enrichContactField(OWNER, "c1", "email");
    expect(result.message).toMatch(/already set/i);
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(findVerifiedEmail).not.toHaveBeenCalled();
  });

  it("refuses email enrichment without a first AND last name", async () => {
    contactFindUnique.mockResolvedValue(contact({ name: "Ada" }));

    await expect(enrichContactField(OWNER, "c1", "email")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(findVerifiedEmail).not.toHaveBeenCalled();
  });

  it("will not guess a company from free-text name when no strong domain exists", async () => {
    contactFindUnique.mockResolvedValue(
      contact({
        website: null,
        email: null,
        entity: null,
        company: "Analytical Engines",
      }),
    );

    await expect(enrichContactField(OWNER, "c1", "email")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(findVerifiedEmail).not.toHaveBeenCalled();
  });

  it("does not treat a freemail address as the company domain", async () => {
    // Phone is unset; the only candidate domain is the gmail address. That
    // must not unlock a paid lookup — same rule as email enrichment.
    contactFindUnique.mockResolvedValue(
      contact({
        website: null,
        entity: null,
        email: "ada@gmail.com",
        company: "Analytical Engines",
      }),
    );

    await expect(enrichContactField(OWNER, "c1", "phone")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(findMobile).not.toHaveBeenCalled();
  });
});

describe("enrichContactField - accuracy", () => {
  it("drops an off-domain waterfall email and never spends", async () => {
    findVerifiedEmail.mockResolvedValue({
      email: "ada@stranger.com",
      via: "anymailfinder",
      verified: true,
    });

    await expect(enrichContactField(OWNER, "c1", "email")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(ensureCredits).toHaveBeenCalledWith(OWNER, "email");
  });

  it("saves a same-company email, advances NEW → ENRICHED, and debits after the hit", async () => {
    findVerifiedEmail.mockImplementation(async () => {
      callOrder.push("findVerifiedEmail");
      return { email: "ada@analytical.com", via: "anymailfinder", verified: true };
    });

    const result = await enrichContactField(OWNER, "c1", "email");

    expect(result.value).toBe("ada@analytical.com");
    expect(result.via).toBe("anymailfinder");
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { email: "ada@analytical.com", status: "ENRICHED" },
    });
    expect(spendCredits).toHaveBeenCalledWith(OWNER, "email", { ref: "c1" });
    expect(callOrder).toEqual(["ensureCredits", "findVerifiedEmail", "spendCredits"]);
  });

  it("accepts a LinkedIn /in/ URL from Exa and rejects a non-profile URL", async () => {
    isExaConfigured.mockReturnValue(true);
    isEmailWaterfallConfigured.mockReturnValue(false);

    exaFindLinkedIn.mockResolvedValue("https://example.com/ada");
    await expect(enrichContactField(OWNER, "c1", "linkedin")).rejects.toBeInstanceOf(OpError);
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();

    exaFindLinkedIn.mockResolvedValue("https://www.linkedin.com/in/ada-lovelace");
    const result = await enrichContactField(OWNER, "c1", "linkedin");
    expect(result.value).toBe("https://www.linkedin.com/in/ada-lovelace");
    expect(spendCredits).toHaveBeenCalledWith(OWNER, "linkedin", { ref: "c1" });
  });

  it("refuses LinkedIn lookup when the contact has no name", async () => {
    isExaConfigured.mockReturnValue(true);
    contactFindUnique.mockResolvedValue(contact({ name: "" }));

    await expect(enrichContactField(OWNER, "c1", "linkedin")).rejects.toMatchObject({
      name: "OpError",
      status: 400,
    });
    expect(exaFindLinkedIn).not.toHaveBeenCalled();
  });
});
