// super-jev answer validation + jevcal-style coverage helpers.

import type { Answer, ChoiceAnswer, ScoreAnswer } from "../contract";

export function renormalize(probs: Record<string, number>): Record<string, number> {
  const sum = Object.values(probs).reduce((s, p) => s + p, 0);
  if (sum <= 0) return probs;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(probs)) out[k] = v / sum;
  return out;
}

export function choiceIsArgmax(a: ChoiceAnswer): boolean {
  let best = a.choice;
  let bestP = -1;
  for (const [k, p] of Object.entries(a.probabilities)) {
    if (p > bestP) {
      best = k;
      bestP = p;
    }
  }
  return best === a.choice;
}

export function expectedScore(a: ScoreAnswer): number {
  let e = 0;
  for (const [k, p] of Object.entries(a.probabilities)) {
    const i = Number(k);
    if (Number.isFinite(i)) e += i * p;
  }
  return e;
}

export function noulFromAnswer(a: Answer): number | null {
  return a.type === "noul" ? a.noul : null;
}

export type ThresholdReport = {
  id: string;
  threshold: number;
  handled: number;
  acceptedAcc: number;
  allAcc: number;
};

/** Sweep a noul threshold for target accuracy (jevcal). */
export function sweepNoulThreshold(
  id: string,
  rows: Array<{ p: number; gold: boolean }>,
  targetAcc: number,
): ThresholdReport {
  let best: ThresholdReport = { id, threshold: 0.5, handled: 0, acceptedAcc: 0, allAcc: 0 };
  const allCorrect = rows.filter((r) => (r.p >= 0.5) === r.gold).length;
  const allAcc = rows.length ? allCorrect / rows.length : 0;
  for (let t = 50; t <= 95; t += 5) {
    const threshold = t / 100;
    const handledRows = rows.filter((r) => r.p >= threshold || r.p <= 1 - threshold);
    if (handledRows.length === 0) continue;
    const correct = handledRows.filter((r) => (r.p >= 0.5) === r.gold).length;
    const acceptedAcc = correct / handledRows.length;
    const handled = handledRows.length / rows.length;
    if (acceptedAcc >= targetAcc && handled >= best.handled) {
      best = { id, threshold, handled, acceptedAcc, allAcc };
    }
  }
  if (best.handled === 0) best = { id, threshold: 0.5, handled: 0, acceptedAcc: 0, allAcc };
  return best;
}
