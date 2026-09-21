// Pure mail helpers: the inbound classifier (drives do-not-contact, so every
// class is pinned), DNS posture verdicts, and the secret box for SMTP
// passwords (round trip, tamper detection, fail-closed without a key).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { classifyInbound, extractAddress, WARMUP_HEADER } from "@/lib/mail/classify";
import { evaluatePosture, isValidDomain, normalizeDomain } from "@/lib/mail/dns";
import { isSecretBoxConfigured, sealSecret, openSecret } from "@/lib/secret-box";

describe("classifyInbound", () => {
  it("recognises Scalar's own warmup traffic first, by header or marker", () => {
    expect(classifyInbound({ fromAddr: "peer@x.com", headers: { [WARMUP_HEADER]: "1" }, text: "unsubscribe" }).klass).toBe("WARMUP");
    expect(classifyInbound({ fromAddr: "peer@x.com", warmupMarker: true }).klass).toBe("WARMUP");
  });

  it("classifies bounces by sender, subject, or permanent-failure body", () => {
    expect(classifyInbound({ fromAddr: "MAILER-DAEMON@googlemail.com", subject: "hello" }).klass).toBe("BOUNCE");
    expect(classifyInbound({ fromAddr: "someone@x.com", subject: "Undeliverable: intro" }).klass).toBe("BOUNCE");
    expect(classifyInbound({ fromAddr: "postmaster@x.com", subject: "Mail", text: "550 5.1.1 user unknown" }).klass).toBe("BOUNCE");
    // a human quoting an error code in a normal reply is not a bounce
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "re: intro", text: "we saw a 550 5.1.1 last week" }).klass).toBe("REPLY");
  });

  it("honours opt-out language, even inside an auto-looking message", () => {
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "Re: intro", text: "Please remove me from your list." }).klass).toBe("UNSUBSCRIBE");
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "unsubscribe", text: "" }).klass).toBe("UNSUBSCRIBE");
    expect(
      classifyInbound({ fromAddr: "jane@x.com", subject: "Automatic reply", text: "Stop emailing me.", headers: { "auto-submitted": "auto-replied" } }).klass,
    ).toBe("UNSUBSCRIBE");
  });

  it("does not treat deep-body opt-out language as an unsubscribe", () => {
    const filler = "Thanks for the note. ".repeat(60);
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "Re: intro", text: `${filler}\n\nunsubscribe footer` }).klass).toBe("REPLY");
  });

  it("separates out-of-office from other auto-replies", () => {
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "Automatic reply: intro", text: "I am out of the office until Monday." }).klass).toBe("OUT_OF_OFFICE");
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "Re: intro", text: "I'm currently on leave and will return on the 3rd." }).klass).toBe("OUT_OF_OFFICE");
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "Re: intro", text: "Ticket #4521 received.", headers: { "Auto-Submitted": "auto-generated" } }).klass).toBe("AUTO_REPLY");
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "Re: intro", text: "ok", headers: { precedence: "bulk" } }).klass).toBe("AUTO_REPLY");
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "Re: intro", text: "ok", headers: { "auto-submitted": "no" } }).klass).toBe("REPLY");
  });

  it("defaults to REPLY for a human message and OTHER for an empty one", () => {
    expect(classifyInbound({ fromAddr: "jane@x.com", subject: "Re: intro", text: "Sure, send me the deck." }).klass).toBe("REPLY");
    expect(classifyInbound({ fromAddr: "jane@x.com" }).klass).toBe("OTHER");
  });

  it("extracts bare addresses", () => {
    expect(extractAddress("Jane Doe <Jane@X.com>")).toBe("jane@x.com");
    expect(extractAddress("  jane@x.com ")).toBe("jane@x.com");
    expect(extractAddress(null)).toBe("");
  });
});

describe("evaluatePosture", () => {
  const good = {
    txt: ["v=spf1 include:_spf.google.com ~all", "google-site-verification=abc"],
    mx: [{ exchange: "smtp.google.com", priority: 1 }],
    dmarcTxt: ["v=DMARC1; p=none; rua=mailto:dmarc@x.com"],
    dkimTxt: ["v=DKIM1; k=rsa; p=MIIBIjANBg..."],
    dkimSelector: "google",
  };

  it("passes a fully configured domain", () => {
    const p = evaluatePosture(good);
    expect(p).toMatchObject({ spfOk: true, dkimOk: true, dmarcOk: true, mxOk: true });
  });

  it("rejects +all SPF and flags missing records with actionable findings", () => {
    const p = evaluatePosture({ ...good, txt: ["v=spf1 +all"], dmarcTxt: [], mx: [] });
    expect(p.spfOk).toBe(false);
    expect(p.dmarcOk).toBe(false);
    expect(p.mxOk).toBe(false);
    expect(p.findings.join("\n")).toMatch(/\+all/);
    expect(p.findings.join("\n")).toMatch(/No DMARC/);
    expect(p.findings.join("\n")).toMatch(/No MX/);
  });

  it("treats an unknown DKIM selector as unchecked, not failed", () => {
    const p = evaluatePosture({ ...good, dkimSelector: null, dkimTxt: [] });
    expect(p.dkimOk).toBe(false);
    expect(p.findings.join("\n")).toMatch(/not checked/);
    const q = evaluatePosture({ ...good, dkimTxt: [] });
    expect(q.findings.join("\n")).toMatch(/No DKIM key/);
  });
});

describe("domain helpers", () => {
  it("normalises and validates", () => {
    expect(normalizeDomain(" HTTPS://Try-Acme.com/ ")).toBe("try-acme.com");
    expect(isValidDomain("try-acme.com")).toBe(true);
    expect(isValidDomain("outreach.try-acme.io")).toBe(true);
    expect(isValidDomain("not a domain")).toBe(false);
    expect(isValidDomain("localhost")).toBe(false);
  });
});

describe("secret box", () => {
  const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.MAILBOX_SECRET_KEY;
    process.env.MAILBOX_SECRET_KEY = KEY;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.MAILBOX_SECRET_KEY;
    else process.env.MAILBOX_SECRET_KEY = prev;
  });

  it("round-trips and uses a fresh nonce each time", () => {
    const a = sealSecret("app-password-1234");
    const b = sealSecret("app-password-1234");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(openSecret(a)).toBe("app-password-1234");
    expect(openSecret(b)).toBe("app-password-1234");
  });

  it("detects tampering", () => {
    const sealed = sealSecret("secret");
    const parts = sealed.split(".");
    const body = Buffer.from(parts[2], "base64");
    body[0] ^= 0xff;
    parts[2] = body.toString("base64");
    expect(() => openSecret(parts.join("."))).toThrow();
    expect(() => openSecret("v0.a.b.c")).toThrow(/Unrecognised/);
  });

  it("fails closed without a usable key", () => {
    process.env.MAILBOX_SECRET_KEY = "too-short";
    expect(isSecretBoxConfigured()).toBe(false);
    expect(() => sealSecret("x")).toThrow(/MAILBOX_SECRET_KEY/);
    delete process.env.MAILBOX_SECRET_KEY;
    expect(isSecretBoxConfigured()).toBe(false);
  });

  it("accepts a base64 key too", () => {
    process.env.MAILBOX_SECRET_KEY = Buffer.from(KEY, "hex").toString("base64");
    expect(isSecretBoxConfigured()).toBe(true);
    expect(openSecret(sealSecret("hello"))).toBe("hello");
  });
});
