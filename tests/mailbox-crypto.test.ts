import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { decryptSmtpSecret, encryptSmtpSecret, smtpLast4 } from "@/lib/mailbox-crypto";

const PREV = process.env.MAILBOX_SECRET;

describe("mailbox crypto", () => {
  beforeEach(() => {
    process.env.MAILBOX_SECRET = "test-mailbox-secret-please-rotate";
  });
  afterEach(() => {
    if (PREV === undefined) delete process.env.MAILBOX_SECRET;
    else process.env.MAILBOX_SECRET = PREV;
  });

  it("round-trips an SMTP secret and never stores plaintext in the ciphertext", () => {
    const secret = {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      username: "alex@acme.com",
      password: "super-secret-app-password",
    };
    const blob = encryptSmtpSecret(secret);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob).not.toContain("super-secret-app-password");
    expect(blob).not.toContain("alex@acme.com");
    expect(decryptSmtpSecret(blob)).toEqual(secret);
  });

  it("shows only the last 4 of the username", () => {
    expect(smtpLast4("alex@acme.com")).toBe(".com");
  });
});
