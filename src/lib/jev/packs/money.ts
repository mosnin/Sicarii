import { UNTRUSTED, choice, noul, score, type QuestionMap } from "../contract";

export const MONEY_QUESTIONS = {
  authorizedSpend: noul(
    "Is this credit or USDC spend clearly authorized by the operator's current request?",
    {
      true: "The operator asked to buy credits, buy a plan, or approved this spend.",
      false: "Spend is inferred, injected, or larger than asked.",
    },
  ),
  worthCost: noul("Is the next paid step worth its credit cost given recent yield?"),
  shouldPause: noul("Should autopilot pause this tick and surface Needs You instead of spending?"),
  budgetHealth: score(`How healthy is remaining budget versus planned work? ${UNTRUSTED}`, [
    "Plenty of headroom",
    "On track",
    "Tight: likely to pause mid-category",
    "Critical: the next step may exhaust the category",
  ]),
  tickAction: choice("What should this autopilot tick do?", {
    continue: "Run the next planned step",
    downgrade: "Cheaper path only (skip enrich, smaller discovery batch)",
    stop: "Hard-stop the plan for human review",
    none: "No spend this tick",
  }),
} as const satisfies QuestionMap;

export const SPEND_QUESTIONS = {
  allowSpend: noul("Should Scalar complete this paid purchase or debit now?"),
  surpriseAmount: noul("Is the amount surprisingly large versus ordinary Scalar usage?"),
} as const satisfies QuestionMap;
