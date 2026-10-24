// Email waterfall: never attach an address off the company domain, never accept
// a catch-all/risky Bouncer verdict, and never charge/return junk when finders
// miss. A finder that throws must fall through to the next one.

import { describe, it, expect, vi, beforeEach } from "vitest";

const isAmf = vi.fn();
const amfFind = vi.fn();
const isFindy = vi.fn();
const findyFind = vi.fn();
const isBouncer = vi.fn();
const bouncerVerify = vi.fn();

vi.mock("@/lib/providers/anymailfinder", () => ({
  isAnymailfinderConfigured: () => isAmf(),
  anymailfinderFind: (...args: unknown[]) => amfFind(...args),
}));
vi.mock("@/lib/providers/findymail", () => ({
  isFindymailConfigured: () => isFindy(),
  findymailFind: (...args: unknown[]) => findyFind(...args),
}));
vi.mock("@/lib/providers/bouncer", () => ({
  isBouncerConfigured: () => isBouncer(),
  bouncerVerify: (...args: unknown[]) => bouncerVerify(...args),
}));

import { findVerifiedEmail, isEmailWaterfallConfigured } from "@/lib/enrich/email-waterfall";

beforeEach(() => {
  vi.clearAllMocks();
  isAmf.mockReturnValue(false);
  isFindy.mockReturnValue(false);
  isBouncer.mockReturnValue(false);
});

describe("isEmailWaterfallConfigured", () => {
  it("is true when either finder is configured", () => {
    expect(isEmailWaterfallConfigured()).toBe(false);
    isAmf.mockReturnValue(true);
    expect(isEmailWaterfallConfigured()).toBe(true);
    isAmf.mockReturnValue(false);
    isFindy.mockReturnValue(true);
    expect(isEmailWaterfallConfigured()).toBe(true);
  });
});

describe("findVerifiedEmail", () => {
  it("returns null when no finder is configured", async () => {
    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.engine" }),
    ).resolves.toBeNull();
    expect(amfFind).not.toHaveBeenCalled();
    expect(findyFind).not.toHaveBeenCalled();
  });

  it("skips a candidate that is not on the company domain", async () => {
    isAmf.mockReturnValue(true);
    amfFind.mockResolvedValue("ada@gmail.com");
    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.engine" }),
    ).resolves.toBeNull();
    expect(bouncerVerify).not.toHaveBeenCalled();
  });

  it("accepts a subdomain of the company domain", async () => {
    isAmf.mockReturnValue(true);
    amfFind.mockResolvedValue("ada@mail.analytical.engine");
    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.engine" }),
    ).resolves.toEqual({
      email: "ada@mail.analytical.engine",
      via: "anymailfinder",
      verified: false,
    });
  });

  it("rejects catch-all / risky / undeliverable Bouncer verdicts", async () => {
    isAmf.mockReturnValue(true);
    isBouncer.mockReturnValue(true);
    amfFind.mockResolvedValue("ada@analytical.engine");

    for (const verdict of ["risky", "undeliverable", "unknown"] as const) {
      bouncerVerify.mockResolvedValueOnce(verdict);
      await expect(
        findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.engine" }),
      ).resolves.toBeNull();
    }
  });

  it("returns a deliverable on-domain address as verified", async () => {
    isAmf.mockReturnValue(true);
    isBouncer.mockReturnValue(true);
    amfFind.mockResolvedValue("ada@analytical.engine");
    bouncerVerify.mockResolvedValue("deliverable");

    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.engine" }),
    ).resolves.toEqual({
      email: "ada@analytical.engine",
      via: "anymailfinder",
      verified: true,
    });
  });

  it("falls through to the next finder when the first throws", async () => {
    isAmf.mockReturnValue(true);
    isFindy.mockReturnValue(true);
    amfFind.mockRejectedValue(new Error("timeout"));
    findyFind.mockResolvedValue("ada@analytical.engine");

    await expect(
      findVerifiedEmail({ fullName: "Ada Lovelace", domain: "analytical.engine" }),
    ).resolves.toEqual({
      email: "ada@analytical.engine",
      via: "findymail",
      verified: false,
    });
  });
});
