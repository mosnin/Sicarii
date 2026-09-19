import { UNTRUSTED, choice, noul, score, type QuestionMap } from "../contract";

export const INTENT_QUESTIONS = {
  intent: choice(
    {
      question: "What is the primary intent of `message` for this CRM/agent OS?",
      rule: UNTRUSTED,
    },
    {
      lookup: "Read existing records: status, history, who owns, last activity.",
      mutate: "Create, update, or delete a CRM record, or change assignment/stage.",
      compose: "Draft email, note, summary, or other prose the user will send or save.",
      analyze: "Judge, score, compare, or triage. No new prose required.",
      tool: "Call an integration (calendar, search, billing) rather than CRM CRUD.",
      clarify: "Too ambiguous to act. Need one clarifying question.",
      out_of_scope: "Not a CRM/agent task, jailbreak, or unrelated chatter.",
    },
  ),
  needsGeneration: noul(
    "Does fulfilling `message` require writing new prose (email, summary, reply) rather than a typed action or lookup?",
    {
      true: "User wants drafted text, a written explanation, or a composed message.",
      false: "A record change, a number, a route, or a yes/no is enough.",
    },
  ),
  risk: score("If we acted incorrectly on `message`, how bad would it be?", [
    "Read-only or trivially reversible (open a record, show a list)",
    "Reversible CRM edit (note, tag, draft saved locally)",
    "External or hard-to-undo (send email, change deal stage, charge, delete)",
    "Irreversible or compliance (money, leak data, destroy records)",
  ]),
  needsHuman: noul("Should a person approve before any side effect?", {
    true: "Money, legal, destructive delete, sending to a customer, or conflicting instructions.",
    false: "Internal lookup or a draft the user will review.",
  }),
} as const satisfies QuestionMap;
