// The bandit core for self-optimizing outreach: which subject line or opener
// wins the most replies, without a human ever configuring an A/B test. Pure
// math, no I/O, so it is deterministically unit-testable given a seeded RNG -
// variant-operations.ts is the only caller, and it supplies the live
// sends/replies read from the database as plain numbers.
//
// ALGORITHM: Thompson sampling over a Beta-Bernoulli model.
//
// Model each variant i as a coin whose true (unknown) reply rate is theta_i.
// After observing `sends_i` outbound sends and `replies_i` replies to it, the
// posterior belief over theta_i is:
//
//   theta_i ~ Beta(replies_i + 1, sends_i - replies_i + 1)
//
// The "+1, +1" is a Beta(1,1) prior - the uniform distribution on [0,1] - so
// before any data every variant is equally likely to be anywhere from 0% to
// 100%. Each observed send is a Bernoulli trial (replied or not), and Beta is
// the conjugate prior for Bernoulli/Binomial data, so the posterior after
// more sends is exactly another Beta with parameters shifted by the counts.
//
// To PICK a variant: draw ONE random sample from every candidate's posterior
// and return whichever variant drew the highest sample. This single rule is
// self-balancing between exploration and exploitation with no separate
// epsilon knob to tune:
//
//   - EARLY (few sends): posteriors are WIDE (close to uniform), so the
//     samples scatter widely and every variant wins the draw roughly as
//     often as any other - this IS exploration, for free.
//   - LATER (many sends): each variant's posterior concentrates around its
//     true reply rate. A variant that is genuinely better has a posterior
//     shifted higher, so its samples win more and more often - this IS
//     exploitation, for free, and the transition is smooth rather than a
//     hard cutover at some fixed sample count.
//   - A variant that looks bad early can still recover: its posterior stays
//     wide (not yet ruled out) until enough sends pin it down, so an early
//     unlucky streak never permanently locks it out.
//
// This is why Thompson sampling is used here instead of fixed epsilon-greedy:
// the exploration rate adapts per arm to how much is actually known about it,
// instead of a single global constant that is either too greedy (converges on
// a false winner from noise) or too wasteful (keeps sending the loser long
// after the data is clear).

export interface VariantArm {
  id: string;
  sends: number;
  replies: number;
}

export type Rng = () => number;

/** Standard normal sample via the Box-Muller transform, driven entirely by
 *  `rng` (two independent uniforms in, one N(0,1) out) so it is deterministic
 *  under a seeded generator. */
function sampleStandardNormal(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng(); // exclude exactly 0: log(0) is -Infinity
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Gamma(shape, 1) sample via Marsaglia-Tsang rejection sampling (shape >= 1).
 * For shape < 1 this boosts via the standard identity
 * Gamma(a) = Gamma(a+1) * U^(1/a); every shape passed in by sampleBeta below
 * is `count + 1 >= 1`, so the boost branch is dead in practice here but keeps
 * the helper correct in general.
 */
function sampleGamma(shape: number, rng: Rng): number {
  if (shape < 1) {
    const boosted = sampleGamma(shape + 1, rng);
    const u = rng();
    return boosted * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleStandardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    const x2 = x * x;
    if (u < 1 - 0.0331 * x2 * x2) return d * v;
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(alpha, beta) sample via two Gamma draws: X ~ Gamma(alpha, 1),
 *  Y ~ Gamma(beta, 1), then X / (X + Y) ~ Beta(alpha, beta). */
function sampleBeta(alpha: number, beta: number, rng: Rng): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  return x / (x + y);
}

/**
 * Pick the winning variant id by Thompson sampling over each arm's
 * Beta(replies+1, sends-replies+1) posterior (see the module docstring for
 * the math). Pure and deterministic given `rng`: production callers omit it
 * (defaults to Math.random); tests inject a seeded generator so the
 * exploration/exploitation distribution is assertable.
 *
 * Throws on an empty `arms` array - callers must ensure at least one
 * candidate variant exists before selecting; variant-operations.ts turns that
 * into a clear OpError telling the agent to create_variant first.
 */
export function selectByThompsonSampling(arms: VariantArm[], rng: Rng = Math.random): string {
  if (arms.length === 0) throw new Error("selectByThompsonSampling: no arms to select from");
  let bestId = arms[0].id;
  let bestSample = -Infinity;
  for (const arm of arms) {
    const alpha = arm.replies + 1;
    const beta = Math.max(arm.sends - arm.replies, 0) + 1;
    const sample = sampleBeta(alpha, beta, rng);
    if (sample > bestSample) {
      bestSample = sample;
      bestId = arm.id;
    }
  }
  return bestId;
}
