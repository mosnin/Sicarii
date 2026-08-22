// companyLogoUrl: the logo must be keyed off the verified domain only, never a
// scraped image. Prefer undefined over a wrong logo.
import { describe, it, expect } from "vitest";
import { companyLogoUrl } from "@/lib/firecrawl";

describe("companyLogoUrl", () => {
  it("returns the clearbit URL for a bare domain", () => {
    expect(companyLogoUrl("acme.com")).toBe("https://logo.clearbit.com/acme.com");
  });

  it("strips www and lowercases the host", () => {
    expect(companyLogoUrl("www.Acme.COM")).toBe("https://logo.clearbit.com/acme.com");
    expect(companyLogoUrl("WWW.EXAMPLE.ORG")).toBe("https://logo.clearbit.com/example.org");
  });

  it("handles full URLs with paths and query strings", () => {
    expect(companyLogoUrl("https://www.acme.com/about/team?ref=x")).toBe(
      "https://logo.clearbit.com/acme.com"
    );
    expect(companyLogoUrl("http://sub.acme.com/contact")).toBe(
      "https://logo.clearbit.com/sub.acme.com"
    );
  });

  it("returns undefined for empty or missing input", () => {
    expect(companyLogoUrl("")).toBeUndefined();
    expect(companyLogoUrl(null)).toBeUndefined();
    expect(companyLogoUrl(undefined)).toBeUndefined();
  });

  it("returns undefined for garbage input", () => {
    expect(companyLogoUrl("not a url at all")).toBeUndefined();
    expect(companyLogoUrl("ht!tp://%%%")).toBeUndefined();
  });

  it("returns undefined when the host has no dot", () => {
    expect(companyLogoUrl("localhost")).toBeUndefined();
    expect(companyLogoUrl("acme")).toBeUndefined();
  });
});
