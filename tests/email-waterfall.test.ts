// Email finder → verifier waterfall: never attach an off-domain or
// undeliverable address. A miss here is free and silent; a hit that slips
// through becomes a contact's work email and trains outreach.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { anymailfinderFind, isAnymailfinderConfigured } = vi.hoisted(() => ({
  anymailfinderFind: vi.fn(),
  isAnymailfinderConfigured: vi.fn(),
}));
const { findymailFind, isFindymailConfigured } = vi.hoisted(() => ({
  findymailFind: vi.fn(),
  isFindymailConfigured: vi.fn(),
}));
const { bouncerVerify, isBouncerConfigured } = vi.hoisted(() => ({
  bouncerVerify: vi.fn(),
  isBouncerConfigured: vi.fn(),
}));

vi.mock("@/lib/providers/anymailfinder", () => ({
  anymailfinderFind,
  isAnymailfinderConfigured,
}));
vi.mock("@/lib/providers/findymail", () => ({
  findymailFind,
  isFindymailConfigured,
}));
vi.mock("@/lib/providers/bouncer", () => ({
  bouncerVerify,
  isBouncerConfigured,
}));

import { findVerifiedEmail, isEmailWaterfallConfigured } from "@/lib/enrich/email-waterfall";

beforeEach(() => {
  vi.clearAllMocks();
  isAnymailfinderConfigured.mockReturnValue(true);
  isFindymailConfigured.mockReturnValue(true);
  isBouncerConfigured.mockReturnValue(true);
  anymailfinderFind.mockResolvedValue(null);
  findymailFind.mockResolvedValue(null);
  bouncerVerify.mockResolvedValue("deliverable");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isEmailWaterfallConfigured", () => {
  it("is true when either finder is configured", () => {
    isAnymailfinderConfigured.mockReturnValue(false);
    isFindymailConfigured.mockReturnValue(true);
    expect(isEmailWaterfallConfigured()).toBe(true);

    isAnymailfinderConfigured.mockReturnValue(false);
    isFindymailConfigured.mockReturnValue(false);
    expect(isEmailWaterfallConfigured()).toBe(false);
  });
});

describe("findVerifiedEmail", () => {
  it("rejects a finder hit on a different company domain", async () => {
    anymailfinderFind.mockResolvedValue("ada@stranger.com");

    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.com" }),
    ).resolves.toBeNull();
    expect(bouncerVerify).not.toHaveBeenCalled();
  });

  it("accepts a subdomain of the requested company domain", async () => {
    anymailfinderFind.mockResolvedValue("ada@mail.analytical.com");

    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.com" }),
    ).resolves.toEqual({
      email: "ada@mail.analytical.com",
      via: "anymailfinder",
      verified: true,
    });
  });

  it("rejects catch-all / risky / undeliverable / unknown verdicts", async () => {
    anymailfinderFind.mockResolvedValue("ada@analytical.com");

    for (const verdict of ["risky", "undeliverable", "unknown"] as const) {
      bouncerVerify.mockResolvedValueOnce(verdict);
      await expect(
        findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.com" }),
      ).resolves.toBeNull();
    }
  });

  it("falls through to the next finder when the first returns an off-domain or failed lookup", async () => {
    anymailfinderFind.mockRejectedValue(new Error("timeout"));
    findymailFind.mockResolvedValue("ada@analytical.com");

    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.com" }),
    ).resolves.toEqual({
      email: "ada@analytical.com",
      via: "findymail",
      verified: true,
    });
  });

  it("accepts an unverified finder hit when Bouncer is not configured", async () => {
    isBouncerConfigured.mockReturnValue(false);
    anymailfinderFind.mockResolvedValue("ada@analytical.com");

    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.com" }),
    ).resolves.toEqual({
      email: "ada@analytical.com",
      via: "anymailfinder",
      verified: false,
    });
    expect(bouncerVerify).not.toHaveBeenCalled();
  });

  it("treats a Bouncer throw as unknown and keeps looking", async () => {
    anymailfinderFind.mockResolvedValue("ada@analytical.com");
    bouncerVerify.mockRejectedValue(new Error("bouncer down"));

    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.com" }),
    ).resolves.toBeNull();
  });
});
