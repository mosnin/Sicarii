// Warmup policy is the safety valve on real sending: these numbers decide when
// a fresh mailbox may send its first cold email and how much. Every branch is
// pinned so a "small tweak" cannot silently let a day-2 inbox blast 50 mails.

import { describe, it, expect } from "vitest";
import {
  warmupTargetForDay,
  coldCapForState,
  coldRemainingToday,
  warmupRemainingToday,
  statusForWarmupDay,
  computeHealthScore,
  warmupMessage,
  warmupReply,
  isWarmupToken,
  COLD_START_DAY,
  WARMED_DAY,
  WARMUP_MAX_PER_DAY,
  type WarmupState,
} from "@/lib/mail/warmup";

function state(over: Partial<WarmupState> = {}): WarmupState {
  return {
    status: "WARMING",
    warmupEnabled: true,
    warmupDay: 0,
    dailyCap: 30,
    healthScore: 100,
    sentToday: 0,
    warmupSentToday: 0,
    ...over,
  };
}

describe("warmup ramp", () => {
  it("starts small, steps up, and plateaus", () => {
    expect(warmupTargetForDay(0)).toBe(4);
    expect(warmupTargetForDay(1)).toBe(7);
    expect(warmupTargetForDay(12)).toBe(WARMUP_MAX_PER_DAY);
    expect(warmupTargetForDay(100)).toBe(WARMUP_MAX_PER_DAY);
    expect(warmupTargetForDay(-3)).toBe(0);
  });

  it("does not send warmup when paused, disabled, provisioning, unhealthy, or opted out", () => {
    expect(warmupRemainingToday(state({ status: "PAUSED" }))).toBe(0);
    expect(warmupRemainingToday(state({ status: "DISABLED" }))).toBe(0);
    expect(warmupRemainingToday(state({ status: "PROVISIONING" }))).toBe(0);
    expect(warmupRemainingToday(state({ healthScore: 49 }))).toBe(0);
    expect(warmupRemainingToday(state({ warmupEnabled: false }))).toBe(0);
    expect(warmupRemainingToday(state({ warmupDay: 3, warmupSentToday: 5 }))).toBe(13 - 5);
  });
});

describe("cold cap", () => {
  it("is zero for the first two weeks of warmup", () => {
    for (let d = 0; d < COLD_START_DAY; d++) expect(coldCapForState(state({ warmupDay: d }))).toBe(0);
  });

  it("opens to a small allowance in weeks 3-4, a larger one in weeks 5-6, then the full cap", () => {
    expect(coldCapForState(state({ warmupDay: COLD_START_DAY }))).toBe(10);
    expect(coldCapForState(state({ warmupDay: 27 }))).toBe(10);
    expect(coldCapForState(state({ warmupDay: 28 }))).toBe(20);
    expect(coldCapForState(state({ warmupDay: WARMED_DAY - 1 }))).toBe(20);
    expect(coldCapForState(state({ warmupDay: WARMED_DAY, status: "ACTIVE" }))).toBe(30);
  });

  it("never exceeds the operator's dailyCap even mid-ramp", () => {
    expect(coldCapForState(state({ warmupDay: 20, dailyCap: 5 }))).toBe(5);
    expect(coldCapForState(state({ warmupDay: 30, dailyCap: 8 }))).toBe(8);
  });

  it("trusts the operator when warmup is explicitly off", () => {
    expect(coldCapForState(state({ warmupEnabled: false, warmupDay: 0, status: "ACTIVE" }))).toBe(30);
  });

  it("halves on degraded health and stops below the pause threshold", () => {
    expect(coldCapForState(state({ warmupDay: 50, status: "ACTIVE", healthScore: 74 }))).toBe(15);
    expect(coldCapForState(state({ warmupDay: 50, status: "ACTIVE", healthScore: 75 }))).toBe(30);
    expect(coldCapForState(state({ warmupDay: 50, status: "ACTIVE", healthScore: 49 }))).toBe(0);
  });

  it("is zero when paused / disabled / provisioning regardless of age", () => {
    expect(coldCapForState(state({ warmupDay: 90, status: "PAUSED" }))).toBe(0);
    expect(coldCapForState(state({ warmupDay: 90, status: "DISABLED" }))).toBe(0);
    expect(coldCapForState(state({ warmupDay: 90, status: "PROVISIONING" }))).toBe(0);
  });

  it("remaining subtracts today's sends and floors at zero", () => {
    expect(coldRemainingToday(state({ warmupDay: 50, status: "ACTIVE", sentToday: 12 }))).toBe(18);
    expect(coldRemainingToday(state({ warmupDay: 50, status: "ACTIVE", sentToday: 40 }))).toBe(0);
  });
});

describe("status transitions", () => {
  it("moves WARMING -> ACTIVE at the warmed day and never overrides manual states", () => {
    expect(statusForWarmupDay("WARMING", WARMED_DAY - 1, true)).toBe("WARMING");
    expect(statusForWarmupDay("WARMING", WARMED_DAY, true)).toBe("ACTIVE");
    expect(statusForWarmupDay("PAUSED", 100, true)).toBe("PAUSED");
    expect(statusForWarmupDay("DISABLED", 100, true)).toBe("DISABLED");
    expect(statusForWarmupDay("PROVISIONING", 100, true)).toBe("PROVISIONING");
    expect(statusForWarmupDay("WARMING", 0, false)).toBe("ACTIVE");
  });
});

describe("health score", () => {
  const base = { sent: 1000, bounces: 0, complaints: 0, warmupSent: 0, warmupReplies: 0, warmupSpamSaved: 0 };

  it("is 100 with no negative signals", () => {
    expect(computeHealthScore(base)).toBe(100);
    expect(computeHealthScore({ ...base, sent: 0 })).toBe(100);
  });

  it("punishes bounces proportionally and caps the penalty", () => {
    expect(computeHealthScore({ ...base, bounces: 20 })).toBe(80); // 2%
    expect(computeHealthScore({ ...base, bounces: 50 })).toBe(50); // 5%
    expect(computeHealthScore({ ...base, bounces: 1000 })).toBe(40); // capped at -60
  });

  it("weighs a complaint like ten bounces", () => {
    expect(computeHealthScore({ ...base, complaints: 1 })).toBe(90); // 0.1%
    expect(computeHealthScore({ ...base, complaints: 3 })).toBe(70);
  });

  it("penalises our own warmup mail landing in spam and a low warmup reply rate", () => {
    expect(computeHealthScore({ ...base, warmupSent: 100, warmupSpamSaved: 10, warmupReplies: 40 })).toBe(85);
    expect(computeHealthScore({ ...base, warmupSent: 100, warmupReplies: 5 })).toBe(90);
    // too little warmup traffic to judge reply rate
    expect(computeHealthScore({ ...base, warmupSent: 10, warmupReplies: 0 })).toBe(100);
  });

  it("stays within 0..100", () => {
    expect(computeHealthScore({ sent: 10, bounces: 10, complaints: 10, warmupSent: 10, warmupReplies: 0, warmupSpamSaved: 10 })).toBe(0);
  });
});

describe("warmup content", () => {
  it("is deterministic per seed and carries the token", () => {
    const a = warmupMessage(42, "scw-abcdefgh12", "Sam");
    const b = warmupMessage(42, "scw-abcdefgh12", "Sam");
    expect(a).toEqual(b);
    expect(a.text).toContain("[scw-abcdefgh12]");
    expect(a.text).toContain("Sam");
    expect(warmupReply(7, "scw-abcdefgh12")).toContain("[scw-abcdefgh12]");
  });

  it("recognises its own token and nothing else", () => {
    expect(isWarmupToken("hi\n\n[scw-abcdefgh12]")).toBe(true);
    expect(isWarmupToken("[scw-short]")).toBe(false);
    expect(isWarmupToken("a real reply about pricing")).toBe(false);
    expect(isWarmupToken(null)).toBe(false);
  });
});
