import { describe, it, expect } from "vitest";
import {
  dailySendLimitForWarmupDay,
  mailboxIsSendReady,
  remainingSendsToday,
  shouldPromoteToReady,
  warmupDayFromStart,
} from "@/lib/mailbox-warmup";

describe("mailbox warmup schedule", () => {
  it("keeps day 0 from sending", () => {
    expect(dailySendLimitForWarmupDay(0)).toBe(0);
    expect(dailySendLimitForWarmupDay(-1)).toBe(0);
  });

  it("climbs through the public ramp", () => {
    expect(dailySendLimitForWarmupDay(1)).toBe(5);
    expect(dailySendLimitForWarmupDay(3)).toBe(5);
    expect(dailySendLimitForWarmupDay(7)).toBe(10);
    expect(dailySendLimitForWarmupDay(14)).toBe(20);
    expect(dailySendLimitForWarmupDay(21)).toBe(30);
    expect(dailySendLimitForWarmupDay(30)).toBe(40);
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
});
