import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  decryptSmtpSecret,
  encryptSmtpSecret,
  isSealedSecret,
  openUserSecret,
  sealIfPlain,
  smtpLast4,
} from "@/lib/mailbox-crypto";

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

  it("seals a string and still reads plaintext until rewritten", () => {
    const sealed = sealIfPlain("sk_live_agentmail");
    expect(isSealedSecret(sealed)).toBe(true);
    expect(sealed).not.toContain("sk_live_agentmail");
    expect(openUserSecret(sealed)).toBe("sk_live_agentmail");
    expect(openUserSecret("plain-legacy-key")).toBe("plain-legacy-key");
  });
});
