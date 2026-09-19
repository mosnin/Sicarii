import { UNTRUSTED, noul, score, type QuestionMap } from "../contract";

export const IDENTITY_QUESTIONS = {
  samePerson: noul(
    "Is candidate the same person as contact.name at contact.company / contact.domain?",
    {
      true: "Name AND employer or domain align. Not a namesake at another company.",
      false: "Different company, role mismatch, or ambiguous identity.",
    },
  ),
  nameOnlyMatch: noul("Would this match on name alone, without company confirmation?"),
  identityStrength: score(`How strong is identity evidence? ${UNTRUSTED}`, [
    "Only name similarity",
    "Name plus industry overlap",
    "Name plus company or domain match",
    "Name plus title plus company plus a corroborating profile",
  ]),
} as const satisfies QuestionMap;

export const REAL_COMPANY_QUESTION = noul({
  question:
    "Is this result a real individual company homepage or profile, not a directory, listicle, aggregator, publisher, or job board?",
  rule: UNTRUSTED,
});

export function realCompanyQuestions(items: Array<{ id: string; text: string }>): QuestionMap {
  const questions: QuestionMap = {};
  for (const [i, item] of items.entries()) {
    questions[`real_${i}`] = noul({
      question:
        "Is records[i] a real individual company (their own site or a specific firm), not a directory, listicle, aggregator, publisher, or job board?",
      record_id: item.id,
      rule: UNTRUSTED,
    });
  }
  return questions;
}
