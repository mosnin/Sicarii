// AgentMail thread matching must be a whole email address, never a substring.
// A raw includes() on the stringified thread treats ed@x.com as a hit inside
// fred@x.com and would show another person's mail on this contact's page.

import { describe, it, expect } from "vitest";
import { threadMentionsEmail, isAgentMailConfigured } from "@/lib/agentmail";

describe("isAgentMailConfigured", () => {
  it("is false for empty/missing keys, true for a real one", () => {
    expect(isAgentMailConfigured(undefined)).toBe(false);
    expect(isAgentMailConfigured(null)).toBe(false);
    expect(isAgentMailConfigured("")).toBe(false);
    expect(isAgentMailConfigured("   ")).toBe(false);
    expect(isAgentMailConfigured("am_live_abc")).toBe(true);
  });
});

describe("threadMentionsEmail", () => {
  it("matches the exact contact address, any casing", () => {
    expect(threadMentionsEmail({ from: "Ed@X.com", subject: "hi" }, "ed@x.com")).toBe(true);
    expect(threadMentionsEmail({ participants: ["ed@x.com"] }, "ED@X.COM")).toBe(true);
  });

  it("does not treat a shorter address as a hit inside a longer one", () => {
    expect(threadMentionsEmail({ from: "fred@x.com" }, "ed@x.com")).toBe(false);
    expect(threadMentionsEmail({ to: "hal@co.com" }, "al@co.com")).toBe(false);
    expect(threadMentionsEmail({ from: "bob@co.com.au" }, "bob@co.com")).toBe(false);
  });

  it("does not match an empty or non-email needle", () => {
    expect(threadMentionsEmail({ from: "ed@x.com" }, "")).toBe(false);
    expect(threadMentionsEmail({ from: "ed@x.com" }, "   ")).toBe(false);
    expect(threadMentionsEmail({ from: "ed@x.com" }, "not-an-email")).toBe(false);
  });

  it("extracts an address from a display-name wrapper", () => {
    expect(threadMentionsEmail({ from: "Ed Smith <ed@x.com>" }, "ed@x.com")).toBe(true);
  });
});
