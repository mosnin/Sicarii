import { describe, expect, it } from "vitest";
import { normalizeOrigin, pkceChallenge } from "../bin/scalar.mjs";

describe("Scalar CLI security helpers", () => {
  it("normalizes secure origins", () => {
    expect(normalizeOrigin("https://www.tryscalar.xyz/path")).toBe("https://www.tryscalar.xyz");
    expect(normalizeOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("rejects remote cleartext origins", () => {
    expect(() => normalizeOrigin("http://example.com")).toThrow(/HTTPS/);
  });

  it("produces the RFC 7636 S256 challenge", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
