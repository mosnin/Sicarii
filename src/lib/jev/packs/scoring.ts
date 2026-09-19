import { UNTRUSTED, choice, noul, score, type QuestionMap } from "../contract";

export function fitQuestions(
  items: Array<{ id: string; text: string }>,
  productContext: string,
): QuestionMap {
  const questions: QuestionMap = {};
  for (const [i, item] of items.entries()) {
    questions[`fit_${i}`] = score(
      {
        question: `How strong a fit is records[${i}] for the product in product_context?`,
        record_id: item.id,
        rule: UNTRUSTED,
        product_context: productContext.slice(0, 2000),
      },
      [
        "Unrelated industry, role, or size. No buying signal.",
        "Loose overlap. Missing most ICP constraints.",
        "Partial fit. Some ICP overlap, weak or unclear intent.",
        "Strong fit on industry, role, and size with a real signal.",
        "Exact ICP match with clear in-market evidence.",
      ],
    );
  }
  return questions;
}

export function rankQuestions(
  items: Array<{ id: string; text: string }>,
  intent: string,
): QuestionMap {
  const questions: QuestionMap = {};
  for (const [i, item] of items.entries()) {
    questions[`rank_${i}`] = noul({
      question: `Is records[${i}] about the subject in intent? Shared words with a different meaning do not count.`,
      record_id: item.id,
      intent,
      rule: UNTRUSTED,
    });
  }
  return questions;
}

export const SLOP_QUESTIONS = {
  density: score(`Information density of draft. ${UNTRUSTED}`, [
    "Mostly filler",
    "Thin with a few facts",
    "Mixed",
    "Mostly concrete",
    "High-value throughout",
  ]),
  generality: score("How generic is the draft for this recipient?", [
    "Only vague assertions",
    "Mostly generic",
    "Some specifics",
    "Specific where needed",
    "Precisely scoped",
  ]),
  overallScore: score("Overall slop-likeness of the draft. Judge writing quality, not authorship.", [
    "Not slop-like: enough concrete value for its length",
    "Mostly not, limited thin passages",
    "Mixed; not clearly either way",
    "Mostly slop-like: thin, generic, padded, formulaic",
    "Strongly slop-like: low reader value throughout",
  ]),
  overallLabel: choice("Judge writing quality, not authorship.", {
    slop: "Low-value, generic, padded, formulaic",
    not_slop: "Enough concrete value and distinctive judgment",
  }),
} as const satisfies QuestionMap;

export const PAGE_SECTION_WEIGHTS: Array<[string, number]> = [
  ["clarity", 15],
  ["concision", 10],
  ["specificity", 10],
  ["explanation", 15],
  ["usefulness", 15],
  ["readability", 10],
  ["coherence", 8],
  ["credibility", 7],
  ["mechanics", 5],
  ["intent", 5],
];

export function pageGradeQuestions(): QuestionMap {
  const q: QuestionMap = {};
  for (const [name] of PAGE_SECTION_WEIGHTS) {
    q[name] = score(`Rate the ${name} of page.`, [
      "Fails the bar for this section",
      "Weak, with a few salvageable bits",
      "Adequate but unremarkable",
      "Strong and specific",
      "Exceptional for this section",
    ]);
  }
  return q;
}

export function pageGrade(answers: Record<string, { type: string; score?: number }>): {
  score: number;
  grade: "A" | "B" | "C" | "D" | "E";
} {
  let weighted = 0;
  let total = 0;
  for (const [name, w] of PAGE_SECTION_WEIGHTS) {
    const a = answers[name];
    const s = a && a.type === "score" && typeof a.score === "number" ? a.score : 2;
    weighted += (s / 4) * 100 * w;
    total += w;
  }
  const score = Math.round(weighted / Math.max(1, total));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "E";
  return { score, grade };
}

export const CITATION_QUESTIONS = {
  relation: choice("How does source_quote relate to claim?", {
    supports: "Quote directly warrants the claim",
    partial: "Related but weaker or narrower",
    contradicts: "Quote opposes the claim",
    unrelated: "Different subject",
    not_in_source: "Claim not in the provided text",
  }),
  supports: noul("Does source_quote support claim as written?", {
    true: "A reader would accept the claim from this quote alone.",
    false: "Quote is silent, weaker, or contrary.",
  }),
} as const satisfies QuestionMap;

export const TRIAGE_QUESTIONS = {
  category: choice("What kind of inbound item is this?", {
    bug: "Broken, crashing, or unlike docs",
    feature: "New behaviour or enhancement",
    question: "How/why. Nothing needs changing",
    docs: "Docs, examples, or site",
    chore: "Deps, CI, refactor, tooling",
    lead: "A sales or partnership inbound",
    other: "Spam, off-topic, or none of the above",
  }),
  action: choice("What should Scalar do next?", {
    ask_contact: "Need info before anyone can act",
    reply: "Answer from playbook. No record change",
    investigate: "Research or debug. Cause unknown",
    decide: "Pricing, legal, or exception. Human required",
    accept: "Ready: create task or move stage",
    close: "Spam, duplicate, or out of ICP",
    wait: "Ball with the customer or another team",
  }),
  severity: score("How severe is this for the customer?", [
    "Cosmetic",
    "Inconvenient",
    "Blocks a workflow",
    "Stops the customer",
    "Data loss or outage",
  ]),
  urgency: score("How soon must someone respond?", [
    "Whenever",
    "This week",
    "Today",
    "Now: spreading or executive",
  ]),
} as const satisfies QuestionMap;

export const SEARCH_INTENT = {
  window: choice("What time window does the request imply?", {
    any: "No time cue",
    day: "Last 24 hours",
    week: "This week",
    month: "This month",
    year: "This year",
  }),
} as const satisfies QuestionMap;

export function rerankQuestion(index: number): QuestionMap[string] {
  return noul(`Is results[${index}] about the subject in request? Shared words with a different meaning do not count.`);
}

export function bfsHopQuestion(index: number): QuestionMap[string] {
  return noul(
    `Is links[${index}] likely to reach the target in very few hops? Topical similarity alone is insufficient.`,
  );
}
