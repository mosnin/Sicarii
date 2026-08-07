// Job metadata is the ONLY thing that tells this worker whose data it is
// allowed to speak. A parser that quietly defaults on a malformed payload
// would let one tenant's call be answered with another tenant's context, so
// these tests exist to prove the parser refuses rather than improvises.

import { describe, expect, it } from "vitest";
import { parseJobMetadata } from "../tenant.js";

const VALID = {
  tenantId: "user-A",
  direction: "OUTBOUND",
  phoneNumber: "+15550001111",
  fromNumber: "+15559998888",
  crmContactId: "contact-1",
  systemPrompt: "Be brief.",
  purpose: "confirm the demo on Thursday",
};

describe("parseJobMetadata", () => {
  it("parses a well formed outbound payload", () => {
    const result = parseJobMetadata(JSON.stringify(VALID));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.tenantId).toBe("user-A");
    expect(result.metadata.direction).toBe("OUTBOUND");
    expect(result.metadata.phoneNumber).toBe("+15550001111");
    expect(result.metadata.purpose).toBe("confirm the demo on Thursday");
  });

  it("defaults direction to OUTBOUND when it is absent", () => {
    const { direction, ...rest } = VALID;
    void direction;
    const result = parseJobMetadata(JSON.stringify(rest));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.direction).toBe("OUTBOUND");
  });

  it("accepts an inbound payload without a phone number", () => {
    const result = parseJobMetadata(
      JSON.stringify({ tenantId: "user-A", direction: "INBOUND", fromNumber: "+15559998888" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an outbound payload with no phone number to dial", () => {
    const result = parseJobMetadata(
      JSON.stringify({ tenantId: "user-A", direction: "OUTBOUND", fromNumber: "+15559998888" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("phoneNumber");
  });

  it("rejects a payload with no tenant, never falling back to a default", () => {
    const { tenantId, ...rest } = VALID;
    void tenantId;
    const result = parseJobMetadata(JSON.stringify(rest));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("tenantId");
  });

  it("rejects an empty tenant id", () => {
    const result = parseJobMetadata(JSON.stringify({ ...VALID, tenantId: "" }));
    expect(result.ok).toBe(false);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object rather than the string LiveKit hands us", { tenantId: "user-A" }],
  ])("rejects metadata that is %s", (_label, value) => {
    const result = parseJobMetadata(value);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty string and a whitespace only string", () => {
    expect(parseJobMetadata("").ok).toBe(false);
    expect(parseJobMetadata("   ").ok).toBe(false);
  });

  it("rejects malformed JSON with a readable reason", () => {
    const result = parseJobMetadata("{ tenantId: 'user-A' ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not valid JSON");
  });

  it("rejects valid JSON that is not an object", () => {
    expect(parseJobMetadata('"user-A"').ok).toBe(false);
    expect(parseJobMetadata("[1,2,3]").ok).toBe(false);
    expect(parseJobMetadata("null").ok).toBe(false);
  });

  it("rejects an unknown direction rather than guessing one", () => {
    const result = parseJobMetadata(JSON.stringify({ ...VALID, direction: "SIDEWAYS" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an absurd max call duration", () => {
    const result = parseJobMetadata(JSON.stringify({ ...VALID, maxCallDurationSeconds: 999999 }));
    expect(result.ok).toBe(false);
  });

  it("never throws, whatever it is handed", () => {
    const nasty: unknown[] = [Symbol("x"), () => {}, new Map(), NaN, "{}", "[]"];
    for (const value of nasty) {
      expect(() => parseJobMetadata(value)).not.toThrow();
    }
  });
});
