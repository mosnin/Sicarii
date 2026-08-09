import { describe, it, expect, beforeEach } from "vitest";
import { mintUnsubscribeToken, verifyUnsubscribeToken, buildUnsubscribe } from "@/lib/unsubscribe";

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-unsub";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});

describe("unsubscribe token", () => {
  it("round-trips a (userId, email) pair", () => {
    const token = mintUnsubscribeToken({ userId: "u1", email: "Jane@Acme.com" });
    expect(token).toBeTruthy();
    const payload = verifyUnsubscribeToken(token!);
    expect(payload).toEqual({ userId: "u1", email: "jane@acme.com" }); // lowercased at mint
  });

  it("rejects a tampered token", () => {
    const token = mintUnsubscribeToken({ userId: "u1", email: "jane@acme.com" })!;
    const [body] = token.split(".");
    // Swap the signature for a forged one.
    expect(verifyUnsubscribeToken(`${body}.forged`)).toBeNull();
    // Swap the body (re-aim at another tenant) with the original signature.
    const other = mintUnsubscribeToken({ userId: "u2", email: "jane@acme.com" })!;
    const forged = `${other.split(".")[0]}.${token.split(".")[1]}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("no-dot")).toBeNull();
  });

  it("builds a compliant artifact set with header and footer", () => {
    const a = buildUnsubscribe({ userId: "u1", email: "jane@acme.com" });
    expect(a.url).toContain("https://app.example.com/api/unsubscribe?token=");
    expect(a.listUnsubscribeHeader).toBe(`<${a.url}>`);
    expect(a.listUnsubscribePostHeader).toBe("List-Unsubscribe=One-Click");
    expect(a.footerText).toContain(a.url!);
  });

  it("degrades to nulls (never throws) when no secret is configured", () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.MCP_OAUTH_SECRET;
    delete process.env.CLERK_SECRET_KEY;
    expect(mintUnsubscribeToken({ userId: "u1", email: "a@b.com" })).toBeNull();
    expect(buildUnsubscribe({ userId: "u1", email: "a@b.com" }).url).toBeNull();
  });
});
