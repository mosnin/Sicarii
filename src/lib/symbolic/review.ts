// jev-review funnel + clean-code-review smell matrix.

import { noul, score, type QuestionMap } from "@/lib/jev/contract";

export const REVIEW_SCREEN = {
  correctness: noul("Does this change introduce a correctness bug?"),
  security: noul("Does this change introduce a security issue?"),
  reliability: noul("Does this change introduce a reliability or race issue?"),
  compatibility: noul("Does this change break compatibility or contracts?"),
  testGap: noul("Are tests missing for the new behavior?"),
} as const satisfies QuestionMap;

export const REVIEW_SEVERITY = score("If this lands as-is, how bad is it?", [
  "Nit. Safe to merge.",
  "Should fix soon. Not blocking.",
  "Blocking for this change.",
  "Must not merge. Data or security risk.",
]);

export const CLEAN_CODE_NOULS = [
  "names_hide_intent",
  "encodings_noise_words",
  "inconsistent_naming",
  "does_more_than_one_thing",
  "too_many_arguments",
  "hidden_side_effects",
  "long_function",
  "redundant_or_misleading_comments",
  "commented_out_code",
  "returns_null",
  "swallowed_errors",
  "duplication",
  "magic_numbers",
  "dead_code_or_clutter",
] as const;

export function cleanCodeQuestions(): QuestionMap {
  const q: QuestionMap = {};
  for (const key of CLEAN_CODE_NOULS) {
    q[key] = noul(`Does the patch exhibit ${key.replaceAll("_", " ")}? Yes means a finding.`);
  }
  return q;
}

export const BLOCKING_SEVERITY = 2;
export const ROUTE_SEVERITY = 1.5;

export function reviewVerdict(severity: number, screens: Record<string, number>): {
  blocking: boolean;
  route: boolean;
  findings: string[];
} {
  const findings = Object.entries(screens)
    .filter(([, p]) => p >= 0.7)
    .map(([k]) => k);
  return {
    blocking: severity >= BLOCKING_SEVERITY || findings.includes("security"),
    route: severity >= ROUTE_SEVERITY,
    findings,
  };
}
