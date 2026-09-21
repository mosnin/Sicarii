import { describe, it, expect } from "vitest";
import { draftColdOutreach, outreachLooksHealthy } from "@/lib/mailbox-draft";

describe("draftColdOutreach", () => {
  it("writes a short note with a question and no generic opener", () => {
    const draft = draftColdOutreach({
      contactName: "Jordan Lee",
      company: "Acme",
      title: "Head of Growth",
      productContext: "agent-run CRM for outbound teams",
      opener: "Noticed Acme just opened three AE seats.",
      senderName: "Sam",
    });
    expect(draft.subject.toLowerCase()).toContain("acme");
    expect(draft.body).toContain("Jordan");
    expect(draft.body).toContain("Noticed Acme");
    expect(draft.body).toContain("?");
    expect(draft.body).toContain("Sam");
    expect(draft.body.length).toBeLessThan(700);
    expect(outreachLooksHealthy(draft.subject, draft.body)).toEqual([]);
  });

  it("flags a generic long blast", () => {
    const warnings = outreachLooksHealthy(
      "Partnership opportunity for your organization this quarter and beyond",
      "Dear Sir, I hope this email finds you well. " + "We are the leading vendor. ".repeat(40),
    );
    expect(warnings.length).toBeGreaterThan(0);
  });
});
