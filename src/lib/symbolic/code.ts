// jev-code (devagrawal09/jev-code): bounded workflows only. Exact checks first.
// Report is advisory. Empty findings are not a pass.

export const CODE_WORKFLOWS = [
  "find",
  "check",
  "triage_failures",
  "triage_comments",
  "cannot_tell",
] as const;

export type CodeWorkflow = (typeof CODE_WORKFLOWS)[number];

export type CodeFinding = {
  workflow: CodeWorkflow;
  path?: string;
  note: string;
  exact?: boolean;
};

const SKIPPED_TEST = /\b(xit|xdescribe|it\.skip|describe\.skip|test\.skip)\b/;
const DELETED_ASSERT = /-\s*(expect|assert|assertEquals)\(/;

export function exactCodeChecks(diff: string): CodeFinding[] {
  const findings: CodeFinding[] = [];
  if (SKIPPED_TEST.test(diff)) {
    findings.push({
      workflow: "check",
      note: "Skipped tests appear in the diff.",
      exact: true,
    });
  }
  if (DELETED_ASSERT.test(diff)) {
    findings.push({
      workflow: "check",
      note: "Assertions were deleted.",
      exact: true,
    });
  }
  return findings;
}

export function interpretCodeWorkflow(choice: string): CodeWorkflow {
  return (CODE_WORKFLOWS as readonly string[]).includes(choice)
    ? (choice as CodeWorkflow)
    : "cannot_tell";
}
