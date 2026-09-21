// Mailbox health is readiness, not a fake engagement score.
// Warmup may send only to an explicit sink or per-mailbox targets.
// We never simulate opens, clicks, or peer-inbox reply rings.

export const FAILURES_BEFORE_PAUSE = 3;
export const BOUNCE_SPIKE_MIN = 5;
export const BOUNCE_SPIKE_RATE = 0.2;
export const HEALTH_PAUSE_FLOOR = 30;

export type PauseReason =
  | "smtp_failures"
  | "bounce_spike"
  | "spf_plus_all"
  | "mx_missing"
  | "operator"
  | "auth_fail";

export type DnsFlags = {
  spfOk?: boolean | null;
  dkimOk?: boolean | null;
  dmarcOk?: boolean | null;
  mxOk?: boolean | null;
  spfPlusAll?: boolean | null;
};

export function clampHealthScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Pure health score from failures + DNS + bounce rate. 100 is clean. */
export function computeHealthScore(input: {
  consecutiveFailures: number;
  dns?: DnsFlags | null;
  bounceCount?: number;
  sendCount?: number;
}): number {
  let score = 100;
  score -= Math.min(45, Math.max(0, input.consecutiveFailures) * 15);
  const dns = input.dns;
  if (dns) {
    if (dns.spfPlusAll) score -= 20;
    if (dns.mxOk === false) score -= 25;
    if (dns.spfOk === false && !dns.spfPlusAll) score -= 10;
    if (dns.dkimOk === false) score -= 10;
    if (dns.dmarcOk === false) score -= 10;
  }
  const sends = input.sendCount ?? 0;
  const bounces = input.bounceCount ?? 0;
  if (sends > 0 && bounces / sends >= BOUNCE_SPIKE_RATE && bounces >= BOUNCE_SPIKE_MIN) {
    score -= 15;
  }
  return clampHealthScore(score);
}

export function shouldHardStopDns(dns: DnsFlags): PauseReason | null {
  if (dns.spfPlusAll) return "spf_plus_all";
  if (dns.mxOk === false) return "mx_missing";
  return null;
}

export function shouldAutoPause(input: {
  consecutiveFailures: number;
  healthScore: number;
  dns?: DnsFlags | null;
  bounceCount?: number;
  sendCount?: number;
}): PauseReason | null {
  if (input.dns) {
    const hard = shouldHardStopDns(input.dns);
    if (hard) return hard;
  }
  if (input.consecutiveFailures >= FAILURES_BEFORE_PAUSE) return "smtp_failures";
  const sends = input.sendCount ?? 0;
  const bounces = input.bounceCount ?? 0;
  if (sends > 0 && bounces >= BOUNCE_SPIKE_MIN && bounces / sends >= BOUNCE_SPIKE_RATE) {
    return "bounce_spike";
  }
  if (input.healthScore < HEALTH_PAUSE_FLOOR) return "auth_fail";
  return null;
}

export function pauseReasonLabel(reason: string | null | undefined): string | null {
  switch (reason) {
    case "smtp_failures":
      return "Paused after repeated SMTP or auth failures";
    case "bounce_spike":
      return "Paused after a bounce spike";
    case "spf_plus_all":
      return "Paused: SPF ends with +all";
    case "mx_missing":
      return "Paused: no MX record";
    case "operator":
      return "Paused by operator";
    case "auth_fail":
      return "Paused: mailbox health is too low";
    default:
      return reason ?? null;
  }
}
