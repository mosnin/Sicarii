// Per-field contact enrichment (REST + MCP `enrich_contact`) has a hard
// accuracy rule: never attach a same-name stranger or the wrong company.
// Company domain must come from a STRONG source (website / linked entity /
// corporate work-email) — never a free-text company name or a Gmail. Found
// emails must sit on that domain; people-directory hits need first AND last
// name; phones need the provider body to mention this person.
//
// These tests pin those gates plus the credit/ownership short-circuits. A
// miss here writes a wrong email/phone/LinkedIn onto a live contact.

import { describe, it, expect, vi, beforeEach } from "vitest";

const contactFindUnique = vi.fn();
const contactUpdate = vi.fn((args: { data: Record<string, unknown> }) =>
  Promise.resolve({ id: "c1", ...args.data }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: (...a: unknown[]) => contactFindUnique(...a),
      update: (args: { data: Record<string, unknown> }) => contactUpdate(args),
    },
  },
}));

const { ensureCredits, spendCredits } = vi.hoisted(() => ({
  ensureCredits: vi.fn(async () => undefined),
  spendCredits: vi.fn(async () => undefined),
}));
vi.mock("@/lib/credits", () => ({ ensureCredits, spendCredits }));

const isExaConfigured = vi.fn(() => false);
const exaFindLinkedIn = vi.fn();
vi.mock("@/lib/exa", () => ({
  isExaConfigured: () => isExaConfigured(),
  exaFindLinkedIn: (...a: unknown[]) => exaFindLinkedIn(...a),
}));

const isPipe0Configured = vi.fn(() => false);
const findWorkEmail = vi.fn();
const findMobile = vi.fn();
vi.mock("@/lib/pipe0", () => ({
  isPipe0Configured: () => isPipe0Configured(),
  findWorkEmail: (...a: unknown[]) => findWorkEmail(...a),
  findMobile: (...a: unknown[]) => findMobile(...a),
}));

const isExploriumConfigured = vi.fn(() => false);
const getPeopleAtCompany = vi.fn();
vi.mock("@/lib/explorium", () => ({
  isExploriumConfigured: () => isExploriumConfigured(),
  getPeopleAtCompany: (...a: unknown[]) => getPeopleAtCompany(...a),
}));

const isEmailWaterfallConfigured = vi.fn(() => false);
const findVerifiedEmail = vi.fn();
vi.mock("@/lib/enrich/email-waterfall", () => ({
  isEmailWaterfallConfigured: () => isEmailWaterfallConfigured(),
  findVerifiedEmail: (...a: unknown[]) => findVerifiedEmail(...a),
}));

const recordProvenance = vi.fn(async () => undefined);
vi.mock("@/lib/provenance", () => ({
  recordProvenance: (...a: unknown[]) => recordProvenance(...a),
  CONFIDENCE: { exa: 75, pipe0: 85, explorium: 90, anymailfinder: 80 },
}));

import { enrichContactField } from "@/lib/contact-enrich";
import { OpError } from "@/lib/crm-operations";

const USER = "user-1";
const ATTACKER = "user-2";

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    userId: USER,
    name: "Ada Lovelace",
    email: null,
    phone: null,
    linkedin: null,
    website: "https://www.acme.com",
    company: "Acme",
    title: "Engineer",
    location: null,
    status: "NEW",
    entity: { domain: "acme.com", website: "https://acme.com", name: "Acme" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  contactFindUnique.mockResolvedValue(contact());
  contactUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "c1", ...args.data }),
  );
  ensureCredits.mockResolvedValue(undefined);
  spendCredits.mockResolvedValue(undefined);
  isExaConfigured.mockReturnValue(false);
  isPipe0Configured.mockReturnValue(false);
  isExploriumConfigured.mockReturnValue(false);
  isEmailWaterfallConfigured.mockReturnValue(false);
});

describe("enrichContactField ownership and short-circuits", () => {
  it("denies a non-owner and never calls a provider or writes", async () => {
    contactFindUnique.mockResolvedValue(contact({ userId: USER }));
    isEmailWaterfallConfigured.mockReturnValue(true);

    await expect(enrichContactField(ATTACKER, "c1", "email")).rejects.toMatchObject({
      name: "OpError",
      status: 404,
    });
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(findVerifiedEmail).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("returns without charging when the field is already set", async () => {
    contactFindUnique.mockResolvedValue(contact({ email: "ada@acme.com" }));
    isEmailWaterfallConfigured.mockReturnValue(true);

    const result = await enrichContactField(USER, "c1", "email");
    expect(result.message).toMatch(/already set/i);
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(findVerifiedEmail).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });

  it("gates credits BEFORE any paid provider call", async () => {
    isEmailWaterfallConfigured.mockReturnValue(true);
    ensureCredits.mockRejectedValue(new OpError("Out of credits", 402));

    await expect(enrichContactField(USER, "c1", "email")).rejects.toMatchObject({
      status: 402,
    });
    expect(findVerifiedEmail).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });
});

describe("enrichContactField strong-domain and identity gates", () => {
  it("refuses to guess a company from a free-text name", async () => {
    isEmailWaterfallConfigured.mockReturnValue(true);
    contactFindUnique.mockResolvedValue(
      contact({
        website: null,
        email: null,
        entity: { domain: null, website: null, name: "Acme" },
      }),
    );

    await expect(enrichContactField(USER, "c1", "email")).rejects.toMatchObject({
      status: 400,
    });
    expect(findVerifiedEmail).not.toHaveBeenCalled();
  });

  it("does not treat a Gmail as the company domain when finding a phone", async () => {
    isPipe0Configured.mockReturnValue(true);
    contactFindUnique.mockResolvedValue(
      contact({
        website: null,
        email: "ada@gmail.com",
        entity: { domain: null, website: null, name: "Acme" },
      }),
    );

    await expect(enrichContactField(USER, "c1", "phone")).rejects.toMatchObject({
      status: 400,
    });
    expect(findMobile).not.toHaveBeenCalled();
  });

  it("requires a first AND last name before looking up email/phone", async () => {
    isEmailWaterfallConfigured.mockReturnValue(true);
    contactFindUnique.mockResolvedValue(contact({ name: "Ada" }));

    await expect(enrichContactField(USER, "c1", "email")).rejects.toMatchObject({
      status: 400,
    });
    expect(findVerifiedEmail).not.toHaveBeenCalled();
  });

  it("drops an off-domain email even when a finder returns one", async () => {
    isEmailWaterfallConfigured.mockReturnValue(true);
    findVerifiedEmail.mockResolvedValue({ email: "ada@stranger.io", via: "anymailfinder" });

    await expect(enrichContactField(USER, "c1", "email")).rejects.toMatchObject({
      status: 404,
    });
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("accepts an on-domain email (including a company subdomain) and debits only on a hit", async () => {
    isEmailWaterfallConfigured.mockReturnValue(true);
    findVerifiedEmail.mockResolvedValue({ email: "ada@mail.acme.com", via: "anymailfinder" });

    const result = await enrichContactField(USER, "c1", "email");
    expect(result.value).toBe("ada@mail.acme.com");
    expect(result.via).toBe("anymailfinder");
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ email: "ada@mail.acme.com", status: "ENRICHED" }),
    });
    expect(spendCredits).toHaveBeenCalledWith(USER, "email", { ref: "c1" });
  });

  it("does not walk a later-stage contact back to ENRICHED", async () => {
    isEmailWaterfallConfigured.mockReturnValue(true);
    findVerifiedEmail.mockResolvedValue({ email: "ada@acme.com", via: "anymailfinder" });
    contactFindUnique.mockResolvedValue(contact({ status: "QUALIFIED" }));

    await enrichContactField(USER, "c1", "email");
    const data = contactUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.email).toBe("ada@acme.com");
    expect(data).not.toHaveProperty("status");
  });

  it("rejects an Explorium person who only shares a first name", async () => {
    isExploriumConfigured.mockReturnValue(true);
    getPeopleAtCompany.mockResolvedValue([
      { first_name: "Ada", last_name: "Byron", email: "ada.byron@acme.com", linkedin: "https://linkedin.com/in/wrong" },
    ]);

    await expect(enrichContactField(USER, "c1", "email")).rejects.toMatchObject({
      status: 404,
    });
    expect(contactUpdate).not.toHaveBeenCalled();
  });

  it("accepts an Explorium person when first AND last name match and the email is on-domain", async () => {
    isExploriumConfigured.mockReturnValue(true);
    getPeopleAtCompany.mockResolvedValue([
      { first_name: "Ada", last_name: "Lovelace", email: "ada@acme.com", linkedin: "https://linkedin.com/in/ada" },
    ]);

    const result = await enrichContactField(USER, "c1", "email");
    expect(result.value).toBe("ada@acme.com");
    expect(result.via).toBe("explorium");
  });
});

describe("enrichContactField linkedin and phone accuracy", () => {
  it("drops a LinkedIn URL that is not /in/ or /company/", async () => {
    isExaConfigured.mockReturnValue(true);
    exaFindLinkedIn.mockResolvedValue("https://linkedin.com/school/not-a-person");

    await expect(enrichContactField(USER, "c1", "linkedin")).rejects.toMatchObject({
      status: 404,
    });
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("saves a real /in/ LinkedIn URL from Exa", async () => {
    isExaConfigured.mockReturnValue(true);
    exaFindLinkedIn.mockResolvedValue("https://www.linkedin.com/in/ada-lovelace");

    const result = await enrichContactField(USER, "c1", "linkedin");
    expect(result.value).toBe("https://www.linkedin.com/in/ada-lovelace");
    expect(result.via).toBe("exa");
    expect(spendCredits).toHaveBeenCalledWith(USER, "linkedin", { ref: "c1" });
  });

  it("drops a phone whose provider body does not mention this person", async () => {
    isPipe0Configured.mockReturnValue(true);
    findMobile.mockResolvedValue({
      mobile: "+15551212",
      notes: "result for Jane Doe at other.co",
    });

    await expect(enrichContactField(USER, "c1", "phone")).rejects.toMatchObject({
      status: 404,
    });
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("accepts a phone when the provider body echoes the surname", async () => {
    isPipe0Configured.mockReturnValue(true);
    findMobile.mockResolvedValue({
      mobile: "+15550001",
      person: "Ada Lovelace, Acme",
    });

    const result = await enrichContactField(USER, "c1", "phone");
    expect(result.value).toBe("+15550001");
    expect(result.via).toBe("pipe0");
    expect(spendCredits).toHaveBeenCalledWith(USER, "phone", { ref: "c1" });
  });

  it("reports 502 when a provider errored, 404 when they simply found nothing", async () => {
    isEmailWaterfallConfigured.mockReturnValue(true);
    findVerifiedEmail.mockRejectedValue(new Error("rate limited"));

    await expect(enrichContactField(USER, "c1", "email")).rejects.toMatchObject({
      status: 502,
    });

    findVerifiedEmail.mockResolvedValue(null);
    await expect(enrichContactField(USER, "c1", "email")).rejects.toMatchObject({
      status: 404,
    });
  });
});
