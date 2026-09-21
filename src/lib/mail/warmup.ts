// Warmup policy: pure functions that decide how much a mailbox may send
// today and how healthy it is. The Inngest engine (src/inngest/functions.ts)
// applies these; nothing here touches the database or the network, so every
// number is unit-tested in isolation.
//
// The numbers follow the 2026 cold-email consensus (Instantly, Smartlead,
// lemwarm defaults; PremiumInboxes' onboarding guidance): start at a handful
// of warmup mails a day, ramp by two or three, plateau around 40; allow NO cold
// mail for the first two weeks, a small allowance in weeks three and four,
// then the full cap. Google Workspace and Microsoft 365 both cap a mailbox
// far higher (2,000 / 10,000 recipients a day), so the ceiling here is about
// reputation, not provider limits.

export const WARMUP_START_PER_DAY = 4;
export const WARMUP_STEP_PER_DAY = 3;
export const WARMUP_MAX_PER_DAY = 40;

/** Days of warmup before any cold mail leaves the mailbox. */
export const COLD_START_DAY = 14;
/** Days of warmup at which the mailbox is considered fully warmed. */
export const WARMED_DAY = 42;

/** Health below which nothing (cold or warmup) is sent. */
export const HEALTH_PAUSE_THRESHOLD = 50;
/** Health below which cold sends are halved. */
export const HEALTH_DEGRADED_THRESHOLD = 75;

export interface WarmupState {
  status: "PROVISIONING" | "WARMING" | "ACTIVE" | "PAUSED" | "DISABLED";
  warmupEnabled: boolean;
  warmupDay: number;
  dailyCap: number;
  healthScore: number;
  sentToday: number;
  warmupSentToday: number;
}

/** How many warmup messages a mailbox should send on a given warmup day. */
export function warmupTargetForDay(day: number): number {
  if (day < 0) return 0;
  return Math.min(WARMUP_MAX_PER_DAY, WARMUP_START_PER_DAY + day * WARMUP_STEP_PER_DAY);
}

/** Cold-mail ceiling for today, before subtracting what was already sent. */
export function coldCapForState(s: WarmupState): number {
  if (s.status === "PAUSED" || s.status === "DISABLED" || s.status === "PROVISIONING") return 0;
  if (s.healthScore < HEALTH_PAUSE_THRESHOLD) return 0;
  let cap: number;
  if (!s.warmupEnabled) cap = s.dailyCap; // operator opted out of warmup: trust them
  else if (s.warmupDay < COLD_START_DAY) cap = 0;
  else if (s.warmupDay < 28) cap = Math.min(s.dailyCap, 10);
  else if (s.warmupDay < WARMED_DAY) cap = Math.min(s.dailyCap, 20);
  else cap = s.dailyCap;
  if (s.healthScore < HEALTH_DEGRADED_THRESHOLD) cap = Math.floor(cap / 2);
  return Math.max(0, cap);
}

export function coldRemainingToday(s: WarmupState): number {
  return Math.max(0, coldCapForState(s) - s.sentToday);
}

export function warmupRemainingToday(s: WarmupState): number {
  if (!s.warmupEnabled) return 0;
  if (s.status === "PAUSED" || s.status === "DISABLED" || s.status === "PROVISIONING") return 0;
  if (s.healthScore < HEALTH_PAUSE_THRESHOLD) return 0;
  return Math.max(0, warmupTargetForDay(s.warmupDay) - s.warmupSentToday);
}

/** Status a mailbox should carry given its warmup progress. */
export function statusForWarmupDay(current: WarmupState["status"], day: number, warmupEnabled: boolean): WarmupState["status"] {
  if (current === "PAUSED" || current === "DISABLED" || current === "PROVISIONING") return current;
  if (!warmupEnabled) return "ACTIVE";
  return day >= WARMED_DAY ? "ACTIVE" : "WARMING";
}

export interface HealthInputs {
  /** Lifetime outbound sends (cold + warmup). */
  sent: number;
  bounces: number;
  complaints: number;
  warmupSent: number;
  warmupReplies: number;
  warmupSpamSaved: number;
}

/**
 * 0-100. Starts at 100 and is pulled down by hard signals (bounces,
 * complaints, our own warmup mail landing in spam) and a little by a low
 * warmup reply rate once there is enough warmup traffic to judge. A complaint
 * is worth ten bounces: that is roughly how the receiving providers weigh it.
 */
export function computeHealthScore(h: HealthInputs): number {
  const sent = Math.max(h.sent, 1);
  const bounceRate = h.bounces / sent;
  const complaintRate = h.complaints / sent;
  const spamRate = h.warmupSent > 0 ? h.warmupSpamSaved / h.warmupSent : 0;

  let score = 100;
  // 2% bounce rate costs 20 points; 5% costs 50.
  score -= Math.min(60, bounceRate * 1000);
  // 0.1% complaint rate costs 10 points; 0.3% costs 30.
  score -= Math.min(60, complaintRate * 10_000);
  // 10% of our warmup mail landing in spam costs 15 points.
  score -= Math.min(40, spamRate * 150);
  if (h.warmupSent >= 20) {
    const replyRate = h.warmupReplies / h.warmupSent;
    // Peers reply to ~40% of warmup mail when we're reaching the inbox; a
    // rate under 15% suggests we're not.
    if (replyRate < 0.15) score -= 10;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/* --------------------------- Warmup content --------------------------- */

const SUBJECTS = [
  "Quick question about next week",
  "Following up on our chat",
  "Notes from today",
  "Re: scheduling",
  "Thought you'd find this useful",
  "Checking in",
  "Agenda for Thursday",
  "One more thing",
  "Draft for your review",
  "Catching up",
];

const OPENERS = [
  "Hope your week is going well.",
  "Thanks for getting back to me earlier.",
  "Wanted to share a quick update.",
  "Circling back on this.",
  "Great catching up yesterday.",
];

const BODIES = [
  "I went through the notes and I think we're aligned on the main points. Let me know if Thursday still works for a short call.",
  "Attached nothing this time, just wanted to confirm the timeline we discussed. Early next month seems realistic on our side.",
  "The draft is nearly ready. I'll send the full version once the team has had a look, probably by end of week.",
  "Quick one: did the numbers from last quarter make it to you? Happy to resend if not.",
  "I liked the direction you suggested. Let's keep the scope tight and revisit the extras after the first release.",
  "No action needed here, just keeping you in the loop on where things landed.",
];

const REPLIES = [
  "Thanks, this is helpful. Thursday works for me.",
  "Got it, appreciate the update. Let's talk soon.",
  "Sounds good. I'll take a look and get back to you.",
  "Perfect, thanks for confirming.",
  "Makes sense to me. Let's keep it tight as you said.",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/** Plausible, harmless business mail. The token lets the receiving side
 *  recognise the message as ours even if headers are stripped. */
export function warmupMessage(seed: number, token: string, fromName?: string | null) {
  const subject = pick(SUBJECTS, seed);
  const body = `${pick(OPENERS, seed >> 2)}\n\n${pick(BODIES, seed >> 4)}\n\n${fromName ? `Best,\n${fromName}` : "Best"}\n\n[${token}]`;
  return { subject, text: body };
}

export function warmupReply(seed: number, token: string, fromName?: string | null) {
  return `${pick(REPLIES, seed)}\n\n${fromName ? `Best,\n${fromName}` : "Best"}\n\n[${token}]`;
}

export const WARMUP_TOKEN_PREFIX = "scw-";

export function isWarmupToken(text: string | null | undefined): boolean {
  return Boolean(text && new RegExp(`\\[${WARMUP_TOKEN_PREFIX}[a-z0-9]{8,}\\]`).test(text));
}
