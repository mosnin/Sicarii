import { describe, it, expect } from "vitest";
import {
  classifyInbound,
  inboundHaltsQueuedSend,
  inboundSetsDoNotContact,
  inboundTouchesCrm,
} from "@/lib/mailbox-classifier";

describe("inbound classifier", () => {
  it("classifies warmup sink mail as WARMUP and never as a CRM reply", () => {
    const cls = classifyInbound({
      from: "sink@scalar.dev",
      to: "alex@acme.com",
      subject: "Re: catching up",
      text: "Just keeping this thread warm.",
      warmupSink: "sink@scalar.dev",
    });
    expect(cls).toBe("WARMUP");
    expect(inboundTouchesCrm(cls)).toBe(false);
  });

  it("classifies a bounce and an unsubscribe as do-not-contact", () => {
    expect(
      classifyInbound({
        from: "MAILER-DAEMON@mx.example",
        to: "alex@acme.com",
        subject: "Undeliverable: hi",
        text: "550 5.1.1 user unknown",
      }),
    ).toBe("BOUNCE");
    expect(
      classifyInbound({
        from: "lead@target.com",
        to: "alex@acme.com",
        subject: "unsubscribe",
        text: "Please unsubscribe me from this list.",
      }),
    ).toBe("UNSUBSCRIBE");
    expect(inboundSetsDoNotContact("BOUNCE")).toBe(true);
    expect(inboundSetsDoNotContact("UNSUBSCRIBE")).toBe(true);
    expect(inboundTouchesCrm("BOUNCE")).toBe(false);
  });

  it("classifies OOO and auto-reply without treating them as a human reply", () => {
    expect(
      classifyInbound({
        from: "lead@target.com",
        to: "alex@acme.com",
        subject: "Out of Office",
        text: "I am currently out of the office until Monday.",
      }),
    ).toBe("OOO");
    expect(
      classifyInbound({
        from: "lead@target.com",
        to: "alex@acme.com",
        subject: "Ticket received",
        text: "This is an automated response. Do not reply to this message.",
      }),
    ).toBe("AUTO_REPLY");
    expect(inboundTouchesCrm("OOO")).toBe(false);
  });

  it("classifies a real reply and halts queued send", () => {
    expect(
      classifyInbound({
        from: "lead@target.com",
        to: "alex@acme.com",
        subject: "Re: quick question",
        text: "Thursday works.",
      }),
    ).toBe("REPLY");
    expect(inboundTouchesCrm("REPLY")).toBe(true);
    expect(inboundHaltsQueuedSend("REPLY")).toBe(true);
  });
});
