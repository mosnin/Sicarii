import { describe, it, expect } from "vitest";
import { parseDkim, parseDmarc, parseSpf } from "@/lib/mailbox-dns";

describe("mailbox DNS parsers", () => {
  it("rejects SPF that ends with +all", () => {
    expect(parseSpf(["v=spf1 include:_spf.google.com +all"])).toEqual({
      found: true,
      plusAll: true,
      raw: "v=spf1 include:_spf.google.com +all",
    });
    expect(parseSpf(["v=spf1 include:_spf.google.com ~all"]).plusAll).toBe(false);
    expect(parseSpf(["hello world"]).found).toBe(false);
  });

  it("detects DMARC and DKIM records", () => {
    expect(parseDmarc(["v=DMARC1; p=none"])).toBe(true);
    expect(parseDmarc(["not dmarc"])).toBe(false);
    expect(parseDkim(["v=DKIM1; k=rsa; p=abcd"])).toBe(true);
    expect(parseDkim(["txt=other"])).toBe(false);
  });
});
