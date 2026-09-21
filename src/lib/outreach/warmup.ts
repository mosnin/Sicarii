// Warmup ramp engine (Card 0015).
//
// A new mailbox/domain has no sender reputation; sudden volume reads as spam
// to Gmail/Outlook and burns the domain before the first real campaign. The
// ramp below (warmbly-style, 30 days) starts at a trickle and doubles roughly
// weekly, with hard per-day ceilings for week 1. Pure functions — the inngest
// tick calls targetForDay() and the ops layer records actuals into
// MailboxWarmupDay. Unit-tested; no I/O here.

/** Planned warmup sends per ramp day (1-indexed). Conservative cold-domain curve. */
export const WARMUP_RAMP: readonly number[] = [
  // Week 1: trickle (5 → 12/day). Most burns happen here; stay boring.
  5, 6, 7, 8, 10, 11, 12,
  // Week 2: establish (15 → 30/day).
  15, 17, 20, 22, 25, 27, 30,
  // Week 3: scale (35 → 60/day).
  35, 38, 42, 45, 50, 55, 60,
  // Week 4+: full cold pace (70 → 120/day), then hold at the mailbox cap.
  70, 78, 85, 92, 100, 108, 115, 120, 120,
];

export const WARMUP_DAYS = WARMUP_RAMP.length; // 30

/** Planned sends for a 1-indexed ramp day. Day 0 (not started) → 0; past the end → last value. */
export function targetForDay(day: number): number {
  if (!Number.isInteger(day) || day <= 0) return 0;
  if (day > WARMUP_RAMP.length) return WARMUP_RAMP[WARMUP_RAMP.length - 1];
  return WARMUP_RAMP[day - 1];
}

/** The effective daily cap for a mailbox: ramp target until ready, then its configured cap. */
export function effectiveDailyCap(opts: {
  warmupDay: number;
  status: string;
  dailyCap: number;
}): number {
  if (opts.status !== "ready" && opts.status !== "warming") return 0;
  if (opts.status === "ready") return Math.max(opts.dailyCap, 1);
  return Math.max(targetForDay(opts.warmupDay), 1);
}

export interface WarmupSignals {
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  placement: "inbox" | "spam" | "unknown";
}

/**
 * Decide whether a mailbox advances, holds, or regresses after a ramp day.
 * - Any hard bounce above 8% of sent, or a spam placement, HOLDS the day
 *   (repeat the same volume tomorrow; never push into a reputation hole).
 * - Two consecutive spam placements or bounce rate above 15% REGRESSES to day 1
 *   pacing and flags for human review (returned as `needsReview`).
 * - Otherwise ADVANCE.
 */
export function evaluateWarmupDay(
  day: number,
  signals: WarmupSignals,
  priorSpamDays: number,
): { action: "advance" | "hold" | "regress"; needsReview: boolean; reason: string } {
  const bounceRate = signals.sent > 0 ? signals.bounced / signals.sent : 0;
  if (signals.placement === "spam" && priorSpamDays >= 1) {
    return {
      action: "regress",
      needsReview: true,
      reason: `day ${day}: spam placement two days running — regress to day-1 pacing, human review`,
    };
  }
  if (bounceRate > 0.15 && signals.sent >= 5) {
    return {
      action: "regress",
      needsReview: true,
      reason: `day ${day}: bounce rate ${(bounceRate * 100).toFixed(1)}% — regress, human review`,
    };
  }
  if (signals.placement === "spam" || (bounceRate > 0.08 && signals.sent >= 5)) {
    return {
      action: "hold",
      needsReview: false,
      reason: `day ${day}: weak signal (placement=${signals.placement}, bounce=${(bounceRate * 100).toFixed(1)}%) — hold volume`,
    };
  }
  return { action: "advance", needsReview: false, reason: `day ${day}: clean — advance` };
}

/** Ramp complete when the last ramp day was sent cleanly. */
export function isRampComplete(warmupDay: number): boolean {
  return warmupDay >= WARMUP_DAYS;
}

/**
 * Human-readable warmup state for the mailbox status API/MCP tool.
 * Never invents progress: days come from MailboxWarmupDay rows.
 */
export function warmupSummary(opts: {
  warmupDay: number;
  status: string;
  daysLogged: number;
}): string {
  if (opts.status === "ready") return `ready — ramp complete (${WARMUP_DAYS}/${WARMUP_DAYS} days)`;
  if (opts.status === "warming")
    return `warming — day ${opts.warmupDay}/${WARMUP_DAYS} (${opts.daysLogged} days logged, target today ${targetForDay(opts.warmupDay)})`;
  if (opts.status === "paused") return "paused — warmup held (see pauseWhy)";
  if (opts.status === "burned") return "burned — retired, do not send";
  return `${opts.status} — warmup not started`;
}
