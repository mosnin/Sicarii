// The bandit selection math (Thompson sampling over Beta(replies+1,
// sends-replies+1) posteriors). Pure function, no mocks: a seeded PRNG makes
// the exploration/exploitation distribution assertable and deterministic.

import { describe, it, expect } from "vitest";
import { selectByThompsonSampling, type VariantArm } from "@/lib/variant-bandit";

// mulberry32: a small, well-known, deterministic PRNG. Same seed -> same
// sequence of draws every run, so the distribution assertions below are
// stable (not flaky) across CI machines and repeated runs.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function countPicks(arms: VariantArm[], seed: number, draws: number): Record<string, number> {
  const rng = mulberry32(seed);
  const counts: Record<string, number> = Object.fromEntries(arms.map((a) => [a.id, 0]));
  for (let i = 0; i < draws; i++) {
    const pick = selectByThompsonSampling(arms, rng);
    counts[pick]++;
  }
  return counts;
}

describe("selectByThompsonSampling", () => {
  it("throws on an empty arm list", () => {
    expect(() => selectByThompsonSampling([], mulberry32(1))).toThrow(/no arms/i);
  });

  it("returns the only id when there is exactly one arm", () => {
    const arms: VariantArm[] = [{ id: "solo", sends: 5, replies: 2 }];
    for (let i = 0; i < 20; i++) {
      expect(selectByThompsonSampling(arms, mulberry32(i))).toBe("solo");
    }
  });

  it("is deterministic given the same seed: two independent runs pick identically", () => {
    const arms: VariantArm[] = [
      { id: "a", sends: 10, replies: 3 },
      { id: "b", sends: 10, replies: 7 },
    ];
    const runA = countPicks(arms, 7, 200);
    const runB = countPicks(arms, 7, 200);
    expect(runA).toEqual(runB);

    // A single fresh rng, drawn one pick at a time, also reproduces exactly
    // when reseeded and replayed from scratch.
    const seq1 = Array.from({ length: 30 }, () => selectByThompsonSampling(arms, mulberry32(42)));
    const seq2 = Array.from({ length: 30 }, () => selectByThompsonSampling(arms, mulberry32(42)));
    expect(seq1).toEqual(seq2);
  });

  describe("cold start: no data yet (explore roughly uniformly)", () => {
    it("splits picks close to evenly across 3 untried arms over many draws", () => {
      const arms: VariantArm[] = [
        { id: "x", sends: 0, replies: 0 },
        { id: "y", sends: 0, replies: 0 },
        { id: "z", sends: 0, replies: 0 },
      ];
      const draws = 3000;
      const counts = countPicks(arms, 123, draws);
      // Every arm shares an identical Beta(1,1) (uniform) posterior, so each
      // should win close to 1/3 of draws. Generous tolerance keeps this
      // robust to PRNG choice while still catching a broken/biased sampler.
      for (const id of ["x", "y", "z"]) {
        const share = counts[id] / draws;
        expect(share).toBeGreaterThan(0.25);
        expect(share).toBeLessThan(0.41);
      }
    });
  });

  describe("clear winner: exploitation dominates once the data is decisive", () => {
    it("picks the high-reply-rate arm the large majority of the time", () => {
      const arms: VariantArm[] = [
        { id: "winner", sends: 200, replies: 120 }, // 60% reply rate, well-sampled
        { id: "loser", sends: 200, replies: 10 }, // 5% reply rate, well-sampled
      ];
      const draws = 1000;
      const counts = countPicks(arms, 99, draws);
      expect(counts.winner / draws).toBeGreaterThan(0.9);
    });

    it("still gives an unproven new arm a real shot next to a proven winner (keeps exploring)", () => {
      const arms: VariantArm[] = [
        { id: "proven", sends: 300, replies: 150 }, // 50% reply rate, tight posterior
        { id: "fresh", sends: 0, replies: 0 }, // wide uniform posterior
      ];
      const draws = 2000;
      const counts = countPicks(arms, 55, draws);
      // The fresh arm's wide posterior lets it beat the proven arm's draw
      // often enough to still get picked a non-trivial fraction of the time -
      // this is what "self-balancing exploration" means in practice.
      expect(counts.fresh / draws).toBeGreaterThan(0.03);
      expect(counts.fresh / draws).toBeLessThan(0.5);
    });
  });

  describe("an early unlucky streak does not permanently lock an arm out", () => {
    it("a few early misses still leave real win probability while sends are low", () => {
      const arms: VariantArm[] = [
        { id: "unlucky-early", sends: 3, replies: 0 }, // 0/3 so far - could still be good
        { id: "lucky-early", sends: 3, replies: 2 }, // 2/3 so far
      ];
      const draws = 2000;
      const counts = countPicks(arms, 8, draws);
      // With so little data both posteriors are still wide, so the "unlucky"
      // arm keeps a real (non-negligible) chance instead of being shut out
      // the way a hard elimination rule would - it just doesn't win as often
      // as the arm with the better track record so far.
      expect(counts["unlucky-early"] / draws).toBeGreaterThan(0.03);
      expect(counts["unlucky-early"] / draws).toBeLessThan(0.45);
    });
  });

  it("higher observed reply rate wins more often than a lower one at matched sample size", () => {
    const arms: VariantArm[] = [
      { id: "hi", sends: 50, replies: 25 }, // 50%
      { id: "mid", sends: 50, replies: 15 }, // 30%
      { id: "lo", sends: 50, replies: 5 }, // 10%
    ];
    const draws = 3000;
    const counts = countPicks(arms, 2024, draws);
    expect(counts.hi).toBeGreaterThan(counts.mid);
    expect(counts.mid).toBeGreaterThan(counts.lo);
  });
});
