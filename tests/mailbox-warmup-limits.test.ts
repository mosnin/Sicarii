import { describe, it, expect } from "vitest";
import {
  WARMUP_READY_DAY,
  STEADY_STATE_COLD_NEW_DOMAIN,
  STEADY_STATE_COLD_AGED,
  STEADY_STATE_COLD_BYOK,
  MAX_INBOXES_PER_DOMAIN,
  warmupSendsForDay,
  maxColdSendsForDay,
  dailyTotalCapForDay,
  rampRowForDay,
} from "@/lib/mailbox-warmup-limits";

describe("conservative mailbox warmup limits", () => {
  it("keeps day 0 from sending", () => {
    expect(warmupSendsForDay(0)).toBe(0);
    expect(maxColdSendsForDay(0)).toBe(0);
    expect(dailyTotalCapForDay(-1)).toBe(0);
  });

  it("holds a new domain to warmup-only until day 21", () => {
    expect(maxColdSendsForDay(1, "new_domain_new_inbox")).toBe(0);
    expect(maxColdSendsForDay(3, "new_domain_new_inbox")).toBe(0);
    expect(maxColdSendsForDay(7, "new_domain_new_inbox")).toBe(0);
    expect(maxColdSendsForDay(14, "new_domain_new_inbox")).toBe(0);
    expect(maxColdSendsForDay(20, "new_domain_new_inbox")).toBe(0);
    expect(WARMUP_READY_DAY).toBe(21);
    expect(maxColdSendsForDay(21, "new_domain_new_inbox")).toBe(5);
  });

  it("climbs new-domain warmup slowly, never Instantly-marketing 40 on day 1", () => {
    expect(warmupSendsForDay(1)).toBe(3);
    expect(warmupSendsForDay(3)).toBe(4);
    expect(warmupSendsForDay(7)).toBe(6);
    expect(warmupSendsForDay(14)).toBe(10);
    expect(warmupSendsForDay(21)).toBe(12);
    expect(dailyTotalCapForDay(1)).toBeLessThan(10);
    expect(maxColdSendsForDay(30)).toBeLessThanOrEqual(STEADY_STATE_COLD_NEW_DOMAIN);
    expect(maxColdSendsForDay(40)).toBe(STEADY_STATE_COLD_NEW_DOMAIN);
  });

  it("lets an aged domain start a tiny cold slice on day 7, not day 1", () => {
    expect(maxColdSendsForDay(3, "aged_domain_new_inbox")).toBe(0);
    expect(maxColdSendsForDay(7, "aged_domain_new_inbox")).toBe(2);
    expect(maxColdSendsForDay(14, "aged_domain_new_inbox")).toBe(5);
    expect(maxColdSendsForDay(21, "aged_domain_new_inbox")).toBe(10);
    expect(maxColdSendsForDay(30, "aged_domain_new_inbox")).toBe(STEADY_STATE_COLD_AGED);
  });

  it("caps already-warm BYOK at 25 and skips warmup volume", () => {
    expect(warmupSendsForDay(1, "already_warm_byok")).toBe(0);
    expect(maxColdSendsForDay(1, "already_warm_byok")).toBe(STEADY_STATE_COLD_BYOK);
    expect(maxColdSendsForDay(21, "already_warm_byok")).toBe(STEADY_STATE_COLD_BYOK);
    expect(STEADY_STATE_COLD_BYOK).toBeLessThan(40);
  });

  it("keeps the snapshot rows honest for skills and docs", () => {
    const d3 = rampRowForDay(3);
    expect(d3.warmupSends).toBe(4);
    expect(d3.maxColdSends).toBe(0);
    expect(d3.notes).toMatch(/Warmup only/);
    expect(MAX_INBOXES_PER_DOMAIN).toBe(3);
  });

  it("never lets total cap hide a 40-email day-1 blast", () => {
    for (const day of [1, 2, 3, 7]) {
      expect(dailyTotalCapForDay(day, "new_domain_new_inbox")).toBeLessThanOrEqual(8);
    }
  });
});
