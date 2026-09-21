// Warmup schedule for agent mailboxes. Numbers follow the public warmup
// ramps used by inbox-warmup products (slow first week, then climb): a new
// inbox should not blast. The clock is day-based so a mailbox that sits idle
// still matures; real warmup mail is sent on top when SMTP is connected.

export const WARMUP_READY_DAY = 21;

// Conservative researched ramp (warmup vs first-cold, three profiles) lives in
// src/lib/mailbox-warmup-limits.ts. Import dailyTotalCapForDay /
// maxColdSendsForDay / warmupSendsForDay from there when this table is
// replaced. Do not keep both as competing sources. This 5/10/20/30/40
// ladder is more aggressive than the researched default and is leftover
// from the first mailbox ship.

export function dailySendLimitForWarmupDay(day: number): number {
  if (!Number.isFinite(day) || day <= 0) return 0;
  if (day <= 3) return 5;
  if (day <= 7) return 10;
  if (day <= 14) return 20;
  if (day <= 21) return 30;
  return 40;
}

/** Calendar days since warmup started, 1-indexed. */
export function warmupDayFromStart(startedAt: Date, now: Date): number {
  const ms = now.getTime() - startedAt.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 1;
  return Math.floor(ms / 86_400_000) + 1;
}

export function mailboxIsSendReady(status: string, warmupDay: number): boolean {
  if (status === "ready") return true;
  if (status === "warming" && warmupDay >= WARMUP_READY_DAY) return true;
  return false;
}

export function shouldPromoteToReady(status: string, warmupDay: number): boolean {
  return status === "warming" && warmupDay >= WARMUP_READY_DAY;
}

export function remainingSendsToday(input: {
  sentToday: number;
  sentTodayOn: Date | null;
  dailySendLimit: number;
  now: Date;
}): number {
  const sameDay =
    input.sentTodayOn !== null &&
    input.sentTodayOn.toISOString().slice(0, 10) === input.now.toISOString().slice(0, 10);
  const used = sameDay ? input.sentToday : 0;
  return Math.max(0, input.dailySendLimit - used);
}

export function sameUtcDay(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export const DEFAULT_HOURLY_SEND_LIMIT = 8;
export const WARMUP_SENDS_PER_TICK = 3;

export function sameUtcHour(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  return a.toISOString().slice(0, 13) === b.toISOString().slice(0, 13);
}

export function remainingWarmupToday(input: {
  warmupSentToday: number;
  warmupSentTodayOn: Date | null;
  dailySendLimit: number;
  now: Date;
}): number {
  const used = sameUtcDay(input.warmupSentTodayOn, input.now) ? input.warmupSentToday : 0;
  return Math.max(0, input.dailySendLimit - used);
}

/** Cold remaining. On a warming inbox, total volume (warmup + cold) cannot
 *  exceed the day cap, so cold cannot hide inside warmup. */
export function remainingColdToday(input: {
  sentToday: number;
  sentTodayOn: Date | null;
  warmupSentToday: number;
  warmupSentTodayOn: Date | null;
  dailySendLimit: number;
  status: string;
  now: Date;
}): number {
  const coldUsed = sameUtcDay(input.sentTodayOn, input.now) ? input.sentToday : 0;
  const coldLeft = Math.max(0, input.dailySendLimit - coldUsed);
  if (input.status !== "warming") return coldLeft;
  const warmUsed = sameUtcDay(input.warmupSentTodayOn, input.now) ? input.warmupSentToday : 0;
  return Math.max(0, Math.min(coldLeft, input.dailySendLimit - warmUsed - coldUsed));
}

export function remainingHourly(input: {
  hourlySent: number;
  hourlySentOn: Date | null;
  hourlySendLimit: number;
  now: Date;
}): number {
  const used = sameUtcHour(input.hourlySentOn, input.now) ? input.hourlySent : 0;
  return Math.max(0, input.hourlySendLimit - used);
}

export function nextHourBoundary(now: Date): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

export function followUpSubject(original: string | null | undefined, requested: string): string {
  const req = requested.trim();
  if (!original?.trim()) return req;
  const base = original.replace(/^(re:\s*)+/i, "").trim();
  const reqBase = req.replace(/^(re:\s*)+/i, "").trim();
  if (!base) return req;
  if (base.toLowerCase() === reqBase.toLowerCase() || /^re:/i.test(req)) {
    return original.match(/^re:/i) ? original.trim() : `Re: ${base}`;
  }
  return original.match(/^re:/i) ? original.trim() : `Re: ${base}`;
}
