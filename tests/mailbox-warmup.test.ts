import { describe, it, expect } from "vitest";
import {
  dailySendLimitForWarmupDay,
  followUpSubject,
  mailboxIsSendReady,
  remainingColdToday,
  remainingHourly,
  remainingSendsToday,
  remainingWarmupToday,
  shouldPromoteToReady,
  warmupDayFromStart,
} from "@/lib/mailbox-warmup";

describe("mailbox warmup schedule", () => {
  it("keeps day 0 from sending", () => {
    expect(dailySendLimitForWarmupDay(0)).toBe(0);
    expect(dailySendLimitForWarmupDay(-1)).toBe(0);
  });

  it("uses the researched total cap, not the Instantly 40/day table", () => {
    expect(dailySendLimitForWarmupDay(1)).toBe(3);
    expect(dailySendLimitForWarmupDay(3)).toBe(4);
    expect(dailySendLimitForWarmupDay(7)).toBe(6);
    expect(dailySendLimitForWarmupDay(14)).toBe(10);
    expect(dailySendLimitForWarmupDay(21)).toBe(17);
    expect(dailySendLimitForWarmupDay(30)).toBeLessThanOrEqual(25);
  });

  it("counts calendar days from the start, 1-indexed", () => {
    const start = new Date("2026-09-01T10:00:00.000Z");
    expect(warmupDayFromStart(start, new Date("2026-09-01T22:00:00.000Z"))).toBe(1);
    expect(warmupDayFromStart(start, new Date("2026-09-02T10:00:00.000Z"))).toBe(2);
    expect(warmupDayFromStart(start, new Date("2026-09-21T10:00:00.000Z"))).toBe(21);
  });

  it("promotes warming inboxes on day 21, not before", () => {
    expect(shouldPromoteToReady("warming", 20)).toBe(false);
    expect(shouldPromoteToReady("warming", 21)).toBe(true);
    expect(mailboxIsSendReady("warming", 20)).toBe(false);
    expect(mailboxIsSendReady("warming", 21)).toBe(true);
    expect(mailboxIsSendReady("ready", 1)).toBe(true);
    expect(mailboxIsSendReady("paused", 30)).toBe(false);
  });

  it("resets the daily counter on a new UTC day", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    expect(
      remainingSendsToday({
        sentToday: 5,
        sentTodayOn: new Date("2026-09-21T01:00:00.000Z"),
        dailySendLimit: 5,
        now,
      }),
    ).toBe(0);
    expect(
      remainingSendsToday({
        sentToday: 5,
        sentTodayOn: new Date("2026-09-20T23:00:00.000Z"),
        dailySendLimit: 5,
        now,
      }),
    ).toBe(5);
  });

  it("keeps warmup volume off the cold remaining counter", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    expect(
      remainingWarmupToday({
        warmupSentToday: 3,
        warmupSentTodayOn: now,
        dailySendLimit: 5,
        now,
      }),
    ).toBe(2);
    expect(
      remainingColdToday({
        sentToday: 0,
        sentTodayOn: null,
        warmupSentToday: 3,
        warmupSentTodayOn: now,
        dailySendLimit: 5,
        coldCap: 0,
        status: "warming",
        now,
      }),
    ).toBe(0);
    expect(
      remainingColdToday({
        sentToday: 0,
        sentTodayOn: null,
        warmupSentToday: 3,
        warmupSentTodayOn: now,
        dailySendLimit: 40,
        status: "ready",
        now,
      }),
    ).toBe(40);
  });

  it("caps hourly sends separately from the day cap", () => {
    const now = new Date("2026-09-21T12:30:00.000Z");
    expect(
      remainingHourly({
        hourlySent: 8,
        hourlySentOn: now,
        hourlySendLimit: 8,
        now,
      }),
    ).toBe(0);
    expect(
      remainingHourly({
        hourlySent: 8,
        hourlySentOn: new Date("2026-09-21T11:59:00.000Z"),
        hourlySendLimit: 8,
        now,
      }),
    ).toBe(8);
  });

  it("keeps the original subject on a follow-up", () => {
    expect(followUpSubject("quick question about Acme", "quick question about Acme")).toBe(
      "Re: quick question about Acme",
    );
    expect(followUpSubject("Re: quick question about Acme", "something else")).toBe("Re: quick question about Acme");
  });
});
