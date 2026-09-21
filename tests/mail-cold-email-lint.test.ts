// The cold-email linter is advisory, but agents act on its warnings, so the
// rules must fire exactly when intended and stay quiet on good copy.

import { describe, it, expect } from "vitest";
import { lintColdEmail, COLD_EMAIL_GUIDE } from "@/lib/mail/cold-email";

const GOOD = {
  subject: "the SDR hiring post",
  text: "Saw you're hiring three SDRs in Austin this quarter.\n\nMost teams at that stage lose a week per rep to list-building before anyone picks up a phone.\n\nWorth a look at how Acme's team skipped that?\n\nSam",
};

describe("lintColdEmail", () => {
  it("passes a tight, specific first touch", () => {
    const r = lintColdEmail(GOOD);
    expect(r.warnings).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.wordCount).toBeLessThan(75);
  });

  it("flags length", () => {
    const long = { subject: GOOD.subject, text: "word ".repeat(89) + "word?" };
    expect(lintColdEmail(long).warnings.join(" ")).toMatch(/90 words/);
    const veryLong = { subject: GOOD.subject, text: "word ".repeat(130) + "?" };
    expect(lintColdEmail(veryLong).warnings.join(" ")).toMatch(/under 75/);
  });

  it("flags links and HTML in a first touch, but not in a reply", () => {
    const withLink = { ...GOOD, text: GOOD.text + "\n\nhttps://acme.com/case-study" };
    expect(lintColdEmail(withLink).warnings.join(" ")).toMatch(/link/i);
    expect(lintColdEmail({ ...withLink, isReply: true }).warnings.join(" ")).not.toMatch(/link/i);
    expect(lintColdEmail({ ...GOOD, html: "<p>hi</p>" }).warnings.join(" ")).toMatch(/HTML/);
  });

  it("flags burned or long subjects only on first touch", () => {
    expect(lintColdEmail({ ...GOOD, subject: "Quick question" }).warnings.join(" ")).toMatch(/burned/);
    expect(lintColdEmail({ ...GOOD, subject: "Following up on my previous email about our platform" }).warnings.join(" ")).toMatch(/words; keep it/);
    expect(lintColdEmail({ ...GOOD, subject: "Re: the SDR hiring post", isReply: true }).warnings).toEqual([]);
  });

  it("flags exclamation marks, caps, emoji, and vendor-speak", () => {
    const w = lintColdEmail({
      subject: "hello",
      text: "I hope this finds you well! Our REVOLUTIONARY platform will LEVERAGE synergy to help you seamlessly scale. Worth a look?",
    }).warnings.join(" | ");
    expect(w).toMatch(/exclamation/);
    expect(w).toMatch(/Shouty/);
    expect(w).toMatch(/i hope this finds you well/);
    expect(w).toMatch(/leverage/);
    expect(lintColdEmail({ ...GOOD, text: GOOD.text + " 🚀" }).warnings.join(" ")).toMatch(/emoji/);
  });

  it("wants exactly one question", () => {
    expect(lintColdEmail({ ...GOOD, text: GOOD.text.replace("?", ".") }).warnings.join(" ")).toMatch(/No question/);
    expect(lintColdEmail({ ...GOOD, text: GOOD.text + " Or should I ask someone else?" }).warnings.join(" ")).toMatch(/2 questions/);
    // replies may ask several or none
    expect(lintColdEmail({ ...GOOD, text: "Thanks, Thursday works.", isReply: true }).warnings).toEqual([]);
  });

  it("catches unfilled merge fields", () => {
    expect(lintColdEmail({ ...GOOD, text: "Hi {{first_name}}, " + GOOD.text }).warnings.join(" ")).toMatch(/merge field/);
    expect(lintColdEmail({ ...GOOD, subject: "[Company] and Acme" }).warnings.join(" ")).toMatch(/merge field/);
  });

  it("does not treat common acronyms as shouting", () => {
    expect(lintColdEmail({ ...GOOD, text: GOOD.text.replace("SDRs", "SaaS SDR CRM leads") }).warnings).toEqual([]);
  });

  it("ships the guide agents are pointed at", () => {
    expect(COLD_EMAIL_GUIDE).toMatch(/Under 75 words/);
    expect(COLD_EMAIL_GUIDE).toMatch(/no links/i);
  });
});
