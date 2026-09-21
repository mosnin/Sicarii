// Sender rotation picker (Card 0015).
//
// Origami's core deliverability move: spread sends across many mailboxes, keep
// each one under its safe daily volume, and skip anything unhealthy. This is
// the pure selection half — the ops layer enforces the pick (claims the send,
// increments counters) inside a transaction. Pure + unit-tested.

import { effectiveDailyCap } from "./warmup";

export interface RotationCandidate {
  id: string;
  email: string;
  domainId: string;
  status: string;
  warmupDay: number;
  dailyCap: number;
  sentToday: number;
  /** UTC day string (YYYY-MM-DD) the sentToday counter belongs to. */
  capDay: string;
  hardBounces: number;
  complaints: number;
  domainQuarantined: boolean;
}

export interface RotationResult {
  mailboxId: string;
  email: string;
  reason: string;
}

/** Complaints are fatal-ish: one complaint pauses a mailbox upstream, so the picker is strict. */
const MAX_COMPLAINTS = 0;
/** A few hard bounces are noise; past this the mailbox is recovering, not sending. */
const MAX_HARD_BOUNCES = 3;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pick the next mailbox for one send. Deterministic and boring on purpose:
 * eligible (ready|warming, domain not quarantined, no complaints, bounces
 * under threshold, under today's effective cap) → least-sent-today wins →
 * ties break by id so concurrent ticks spread instead of herding.
 */
export function pickMailbox(
  candidates: RotationCandidate[],
  opts: { today?: string } = {},
): RotationResult | null {
  const today = opts.today ?? todayUtc();
  const eligible = candidates.filter((c) => {
    if (c.domainQuarantined) return false;
    if (c.status !== "ready" && c.status !== "warming") return false;
    if (c.complaints > MAX_COMPLAINTS) return false;
    if (c.hardBounces > MAX_HARD_BOUNCES) return false;
    const sent = c.capDay === today ? c.sentToday : 0;
    const cap = effectiveDailyCap({ warmupDay: c.warmupDay, status: c.status, dailyCap: c.dailyCap });
    return sent < cap;
  });

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const sa = a.capDay === today ? a.sentToday : 0;
    const sb = b.capDay === today ? b.sentToday : 0;
    if (sa !== sb) return sa - sb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const winner = eligible[0];
  const sent = winner.capDay === today ? winner.sentToday : 0;
  const cap = effectiveDailyCap({
    warmupDay: winner.warmupDay,
    status: winner.status,
    dailyCap: winner.dailyCap,
  });
  return {
    mailboxId: winner.id,
    email: winner.email,
    reason: `least-sent eligible (${sent}/${cap} today, status=${winner.status})`,
  };
}

/** How many sends the whole fleet can still absorb today (for scheduler backpressure). */
export function fleetCapacityToday(candidates: RotationCandidate[], today?: string): number {
  const day = today ?? todayUtc();
  let total = 0;
  for (const c of candidates) {
    if (c.domainQuarantined) continue;
    if (c.status !== "ready" && c.status !== "warming") continue;
    if (c.complaints > MAX_COMPLAINTS || c.hardBounces > MAX_HARD_BOUNCES) continue;
    const sent = c.capDay === day ? c.sentToday : 0;
    const cap = effectiveDailyCap({ warmupDay: c.warmupDay, status: c.status, dailyCap: c.dailyCap });
    total += Math.max(cap - sent, 0);
  }
  return total;
}
