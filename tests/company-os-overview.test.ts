import { describe, expect, it } from "vitest";
import { scalarDeepLink, scalarPublicOrigin } from "@/lib/company-os-overview";
import { SCOPE_DESCRIPTIONS } from "@/lib/oauth-server";

describe("Company OS app contract", () => {
  it("advertises a narrow read-only overview scope", () => {
    expect(SCOPE_DESCRIPTIONS["company-os:overview"]).toContain("read-only");
  });

  it("creates only same-origin Scalar deep links", () => {
    expect(scalarDeepLink("https://tryscalar.xyz", "/crm/abc")).toBe("https://tryscalar.xyz/crm/abc");
    expect(scalarDeepLink("https://tryscalar.xyz", "//attacker.example/path")).toBe("https://tryscalar.xyz/dashboard");
    expect(scalarDeepLink("https://tryscalar.xyz", "https://attacker.example/path")).toBe("https://tryscalar.xyz/dashboard");
  });

  it("does not trust forwarded host headers for action URLs", () => {
    const request = new Request("https://tryscalar.xyz/api/company-os/overview", {
      headers: { "x-forwarded-host": "attacker.example" },
    });
    expect(scalarPublicOrigin(request)).toBe("https://tryscalar.xyz");
  });
});
