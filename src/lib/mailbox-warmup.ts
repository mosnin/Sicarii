// Warmup schedule for agent mailboxes. Numbers follow the public warmup
// ramps used by inbox-warmup products (slow first week, then climb): a new
// inbox should not blast. The clock is day-based so a mailbox that sits idle
// still matures; real warmup mail is sent on top when SMTP is connected.

export const WARMUP_READY_DAY = 21;

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
