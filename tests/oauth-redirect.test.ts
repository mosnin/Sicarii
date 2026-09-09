import { describe, expect, it } from "vitest";
import { isAllowedPublicRedirectUri } from "@/lib/oauth-redirect";

describe("OAuth public client redirects", () => {
  it("accepts secure web and loopback redirects", () => {
    expect(isAllowedPublicRedirectUri("https://client.example/callback")).toBe(true);
    expect(isAllowedPublicRedirectUri("http://127.0.0.1:43119/callback")).toBe(true);
    expect(isAllowedPublicRedirectUri("http://localhost:43119/callback")).toBe(true);
  });

  it("accepts only the exact first-party Scalar app callback", () => {
    expect(isAllowedPublicRedirectUri("scalar://oauth/callback")).toBe(true);
    expect(isAllowedPublicRedirectUri("scalar://oauth/other")).toBe(false);
    expect(isAllowedPublicRedirectUri("scalar://attacker/callback")).toBe(false);
  });

  it("rejects insecure remote and malformed redirects", () => {
    expect(isAllowedPublicRedirectUri("http://example.com/callback")).toBe(false);
    expect(isAllowedPublicRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedPublicRedirectUri("not a url")).toBe(false);
  });
});
