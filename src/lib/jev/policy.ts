// One file for thresholds. Every Jev repo that stayed tunable kept gates here
// (jcm-router, typesafe-ai/skills, pi-jev, unclutter, jevcal). Pin jev-1.13.0
// once these are swept on labeled Scalar data. Until then they are reasoned
// starting points, not observed calibration.

import type { GatePolicy } from "./contract";

export const JEV_MODEL = process.env.TYPESAFE_JEV_MODEL?.trim() || "jev-latest";
export const JEV_PINNED_MODEL = "jev-1.13.0";

export const GATES = {
  lookup: { refuseBelow: 0.5, autoAt: 0.6 } satisfies GatePolicy,
  route: { refuseBelow: 0.5, autoAt: 0.7 } satisfies GatePolicy,
  skillLoad: { refuseBelow: 0.5, autoAt: 0.8, minSelectedP: 0.8 } satisfies GatePolicy,
  money: { refuseBelow: 0.6, autoAt: 0.85 } satisfies GatePolicy,
  destructive: { refuseBelow: 0.7, autoAt: 0.9, minSelectedP: 0.9 } satisfies GatePolicy,
  hideUi: { refuseBelow: 0.9, autoAt: 0.9, minSelectedP: 0.9 } satisfies GatePolicy,
  voice: { refuseBelow: 0.5, autoAt: 0.6 } satisfies GatePolicy,
} as const;

/** y0usaf/pi-jev measured pre-tool floors. */
export const TOOL_GATE = {
  destructive: 0.9,
  exfiltration: 0.7,
  beyondScope: 0.85,
  impact: 2.5,
  leaksSecret: 0.9,
  failureMinConf: 0.6,
} as const;

export const SLOP_THRESHOLD = {
  overallSlopChoice: "slop",
  densityMax: 1.5,
} as const;

export const MALICIOUS_THRESHOLD = {
  overallRisk: 1.5,
  familyNoul: 0.7,
} as const;

export const CITATION_MIN_SUPPORT = 0.7;

export const POLICY_VIOLATION = 0.8;

export const QUIET_ASK_AUTO = 0.9;

export const SKILL_LOAD = {
  probability: 0.8,
  maxSkills: 3,
} as const;

export const CLIENT_DEFAULTS = {
  timeoutMs: 2500,
  maxRetries: 2,
  maxStateChars: 28_000,
} as const;
