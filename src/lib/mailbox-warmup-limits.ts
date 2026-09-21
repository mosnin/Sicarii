// Conservative Scalar warmup + first-cold caps.
// Sourced in docs/engineering/mailbox-warmup-limits.md (researched 2026-09-21).
// These numbers are REASONED from public provider limits and vendor ramps.
// We have not observed live deliverability in this repo. When sources
// disagree, take the lower volume. Default is more conservative than
// Instantly marketing (we would rather send 5 than 40).
//
// Implementer: import these instead of the leftover 5/10/20/30/40 table
// in mailbox-warmup.ts once health / remainingColdToday / hourly caps land.

export type WarmupProfile =
  | "new_domain_new_inbox"
  | "aged_domain_new_inbox"
  | "already_warm_byok";

export const DEFAULT_WARMUP_PROFILE: WarmupProfile = "new_domain_new_inbox";

/** Calendar day when a warming inbox may be promoted to ready. */
export const WARMUP_READY_DAY = 21;

/** Industry rule of thumb: 2-3 inboxes per sending domain, never a day-1 blast. */
export const MAX_INBOXES_PER_DOMAIN = 3;

/** Steady-state cold ceiling after a new domain is ready. Not Instantly's 30-40. */
export const STEADY_STATE_COLD_NEW_DOMAIN = 20;

/** Aged domain (6+ months, auth already passing) after the ramp. */
export const STEADY_STATE_COLD_AGED = 25;

/** Operator-attested already-warm BYOK. Still not a blast. */
export const STEADY_STATE_COLD_BYOK = 25;

export type RampRow = {
  day: number;
  warmupSends: number;
  maxColdSends: number;
  notes: string;
};

function clampDay(day: number): number {
  if (!Number.isFinite(day) || day <= 0) return 0;
  return Math.floor(day);
}

function newDomainWarmup(day: number): number {
  if (day <= 2) return 3;
  if (day <= 4) return 4;
  if (day <= 6) return 5;
  if (day <= 8) return 6;
  if (day <= 10) return 7;
  if (day <= 13) return 8;
  if (day <= 16) return 10;
  if (day <= 21) return 12;
  if (day <= 28) return 10;
  return 5;
}

function newDomainCold(day: number): number {
  // Default: no cold until ready (day 21). First ready day is 5, not 40.
  if (day < WARMUP_READY_DAY) return 0;
  if (day === 21) return 5;
  if (day <= 24) return 8;
  if (day <= 28) return 12;
  if (day <= 30) return 15;
  return STEADY_STATE_COLD_NEW_DOMAIN;
}

function agedDomainWarmup(day: number): number {
  if (day <= 3) return 5;
  if (day <= 7) return 8;
  if (day <= 14) return 10;
  if (day <= 21) return 12;
  return 8;
}

function agedDomainCold(day: number): number {
  if (day <= 6) return 0;
  if (day <= 7) return 2;
  if (day <= 14) return 5;
  if (day <= 21) return 10;
  return STEADY_STATE_COLD_AGED;
}

/**
 * Warmup-only volume for the day. Real mail to a sink or named targets,
 * never a peer-network of fake opens. 0 on an already-warm BYOK box.
 */
export function warmupSendsForDay(
  day: number,
  profile: WarmupProfile = DEFAULT_WARMUP_PROFILE,
): number {
  const d = clampDay(day);
  if (d === 0) return 0;
  if (profile === "already_warm_byok") return 0;
  if (profile === "aged_domain_new_inbox") return agedDomainWarmup(d);
  return newDomainWarmup(d);
}

/**
 * Maximum first-touch cold sends for the day.
 * Agent rule: if status is still warming and day < WARMUP_READY_DAY,
 * do not send_email to contacts even if this returns a positive number
 * on the aged profile. Operator mark-ready overrides the day clock.
 */
export function maxColdSendsForDay(
  day: number,
  profile: WarmupProfile = DEFAULT_WARMUP_PROFILE,
): number {
  const d = clampDay(day);
  if (d === 0) return 0;
  if (profile === "already_warm_byok") return STEADY_STATE_COLD_BYOK;
  if (profile === "aged_domain_new_inbox") return agedDomainCold(d);
  return newDomainCold(d);
}

/** Total mailbox daily cap: warmup mail + allowed cold. */
export function dailyTotalCapForDay(
  day: number,
  profile: WarmupProfile = DEFAULT_WARMUP_PROFILE,
): number {
  return warmupSendsForDay(day, profile) + maxColdSendsForDay(day, profile);
}

export function rampNotesForDay(
  day: number,
  profile: WarmupProfile = DEFAULT_WARMUP_PROFILE,
): string {
  const d = clampDay(day);
  if (d === 0) return "Invalid day. Do not send.";
  if (profile === "already_warm_byok") {
    return "Operator attested already warm. Cap 25 cold. Still stop on bounce, complaint, or auth fail.";
  }
  if (profile === "aged_domain_new_inbox") {
    if (d <= 6) return "Aged domain, new inbox. Warmup only. Confirm SPF/DKIM/DMARC before any send.";
    if (d === 7) return "First tiny cold (2) only if bounce is under 1% and no complaints.";
    if (d <= 14) return "Layer a few cold sends. Keep warmup running. One inbox, not a domain blast.";
    if (d <= 21) return "Climb cold slowly. Do not jump to 30-40 because a vendor blog said so.";
    return "Steady state for an aged domain + new inbox. Ceiling 25 cold.";
  }
  if (d < WARMUP_READY_DAY) {
    return "New domain + new inbox. Warmup only. Agent must not send_email to contacts.";
  }
  if (d === 21) {
    return "Ready day. First cold cap is 5, not 40. Promote only if health is clean.";
  }
  if (d <= 30) return "Ramp cold in small steps. Keep a slice of warmup mail.";
  return "Steady state for a new domain. Ceiling 20 cold. Add domains, not volume per inbox.";
}

export function rampRowForDay(
  day: number,
  profile: WarmupProfile = DEFAULT_WARMUP_PROFILE,
): RampRow {
  return {
    day: clampDay(day),
    warmupSends: warmupSendsForDay(day, profile),
    maxColdSends: maxColdSendsForDay(day, profile),
    notes: rampNotesForDay(day, profile),
  };
}

/** Snapshot rows used in skills and the research doc. */
export const SCALAR_RAMP_SNAPSHOT_DAYS = [1, 3, 7, 14, 21, 30] as const;
