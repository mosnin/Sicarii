import { UNTRUSTED, choice, noul, type QuestionMap } from "../contract";

export const ANGLE_DIMS = [
  "vertical",
  "geography",
  "stage",
  "hiring",
  "model",
  "tech",
] as const;

export type AngleDim = (typeof ANGLE_DIMS)[number];

export const ANGLE_COUNT = choice("How many distinct search angles are worth paying for?", {
  two: "Two complementary slices cover the goal",
  three: "Three slices, no more",
  four: "Four slices (default breadth)",
  five: "Five slices; the goal is wide",
  six: "Six slices; only if each is truly independent",
  none: "Do not swarm. One search is enough.",
});

export function angleDimQuestions(): QuestionMap {
  const q: QuestionMap = { count: ANGLE_COUNT };
  for (const dim of ANGLE_DIMS) {
    q[dim] = noul({
      question: `Is a ${dim} slice independently useful for this discovery goal?`,
      rule: UNTRUSTED,
    });
  }
  return q;
}

export function angleQuery(goal: string, dim: AngleDim): string {
  const g = goal.trim();
  switch (dim) {
    case "vertical":
      return `${g} (focus: a specific product category or sub-vertical)`;
    case "geography":
      return `${g} (focus: a specific geography or market)`;
    case "stage":
      return `${g} (focus: company stage or funding)`;
    case "hiring":
      return `${g} (focus: hiring or headcount signal)`;
    case "model":
      return `${g} (focus: business model)`;
    case "tech":
      return `${g} (focus: tech stack or platform)`;
  }
}
