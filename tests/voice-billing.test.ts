import { describe, it, expect } from "vitest";
import { billingDecision, MAX_BILLABLE_MINUTES } from "@/lib/voice-billing";

const answeredAt = new Date("2026-08-09T10:00:00Z");

describe("billingDecision", () => {
  it("bills an answered call the worker already finished (the race regression)", () => {
    // The worker wrote endedAt + status + transcript but left creditsCharged
    // null. The old gate on endedAt would have suppressed this entirely; the
    // new gate on creditsCharged bills it.
    const d = billingDecision(
      { creditsCharged: null, answeredAt, status: "COMPLETED" },
      new Date("2026-08-09T10:03:30Z"),
    );
    expect(d.kind).toBe("answered");
    if (d.kind === "answered") {
      expect(d.talkSeconds).toBe(210);
      expect(d.minutes).toBe(4); // ceil(210/60)
      expect(d.capped).toBe(false);
    }
  });

  it("skips a call that is already settled (creditsCharged set, any value)", () => {
    expect(billingDecision({ creditsCharged: 18, answeredAt, status: "COMPLETED" }, answeredAt).kind).toBe("skip");
    // 0 is a real settlement (an unanswered call was billed free); a redelivery
    // must not re-open it.
    expect(billingDecision({ creditsCharged: 0, answeredAt: null, status: "NO_ANSWER" }, answeredAt).kind).toBe("skip");
  });

  it("bills an unanswered call at zero and keeps a specific SIP outcome", () => {
    const busy = billingDecision({ creditsCharged: null, answeredAt: null, status: "BUSY" }, answeredAt);
    expect(busy).toEqual({ kind: "unanswered", status: "BUSY" });
    // An unanswered call with no specific outcome defaults to NO_ANSWER.
    const unknown = billingDecision({ creditsCharged: null, answeredAt: null, status: "RINGING" }, answeredAt);
    expect(unknown).toEqual({ kind: "unanswered", status: "NO_ANSWER" });
  });

  it("measures talk time from answer to hangup, flooring negatives at zero", () => {
    // A hangup timestamp before the answer (clock skew) never yields negative
    // billable time.
    const d = billingDecision(
      { creditsCharged: null, answeredAt, status: "COMPLETED" },
      new Date("2026-08-09T09:59:00Z"),
    );
    expect(d.kind === "answered" && d.talkSeconds).toBe(0);
    expect(d.kind === "answered" && d.minutes).toBe(0);
  });

  it("caps a stuck room at MAX_BILLABLE_MINUTES and flags it", () => {
    const endedAt = new Date(answeredAt.getTime() + (MAX_BILLABLE_MINUTES + 60) * 60 * 1000);
    const d = billingDecision({ creditsCharged: null, answeredAt, status: "COMPLETED" }, endedAt);
    expect(d.kind === "answered" && d.minutes).toBe(MAX_BILLABLE_MINUTES);
    expect(d.kind === "answered" && d.capped).toBe(true);
  });

  it("counts a partial minute as a full billed minute", () => {
    const d = billingDecision(
      { creditsCharged: null, answeredAt, status: "COMPLETED" },
      new Date(answeredAt.getTime() + 61 * 1000),
    );
    expect(d.kind === "answered" && d.minutes).toBe(2); // ceil(61/60)
  });
});
