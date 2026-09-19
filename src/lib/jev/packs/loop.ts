import { choice, noul, type QuestionMap } from "../contract";

export function actionQuestions(legal: Record<string, string>): QuestionMap {
  return {
    action: choice(
      "Which single legal action best advances the task? You cannot invent actions that are not listed.",
      { ...legal, none: "No listed action is appropriate. Stop or ask." },
    ),
    goalDone: noul("The task goal is achieved on current state/history.", {
      true: "The sought outcome is visible.",
      false: "Not yet achieved.",
    }),
    stuck: noul("Recent actions repeat or nothing changes.", {
      true: "Loop or no progress. A different strategy is needed.",
      false: "Progress is visible or the first steps are reasonable.",
    }),
    earlyStop: noul(
      "Is the agent stopping before the requested work is done (asking 'shall I?', waiting on the human for reversible work, claiming done without logging)?",
    ),
  };
}

export const COMPACT_QUESTIONS = {
  keepCall: noul(
    "Tool call `id` should stay: knowing it was made still matters for what happens next.",
  ),
  keepResult: noul(
    "The full output of tool call `id` must stay verbatim. Re-running would not do.",
  ),
} as const satisfies QuestionMap;

export const QUIET_ASK = {
  determined: noul(
    "Do user_request + last_user_message + recent already determine this question? Being told to ask is not evidence the user must be asked.",
  ),
} as const;
