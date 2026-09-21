// Cold-email writing rules and a deterministic linter. Distilled from the
// operator's reference material (growthenginenowoslawski/coldoutboundskills,
// kalyvask/winning-writing) plus the 2026 deliverability consensus. The guide
// is injected into agent prompts and published as a skill; the linter runs on
// every send_email and returns warnings alongside the result so an agent can
// see, in the same turn, why a message is likely to underperform. It never
// blocks: judgement stays with the agent and the operator's own rules.

export const COLD_EMAIL_GUIDE = `COLD EMAIL WRITING RULES (Scalar)

Shape
- Under 75 words. One idea, one ask. If it needs scrolling on a phone, cut it.
- Plain text only. No HTML, no images, no signature banners, no links in the
  first touch (a link in a cold first email is the strongest spam signal).
- Subject: 2-5 words, lowercase or sentence case, specific to them, no bait
  ("quick question" and "following up" are burned). Best subjects read like a
  colleague's: "the SDR hiring post", "your Stripe migration".
- No greeting theatre. Skip "I hope this finds you well" and "my name is".
  Start with the observation.

Structure (3 lines)
1. Observation: one concrete, verifiable thing about THEM (a hire, a launch, a
   job post, a stack change, a quote). Must come from the CRM record or
   enrichment, never invented. If you have no real observation, do not send.
2. Bridge: one sentence connecting that observation to a problem people in
   their seat have. Name the problem, not your product.
3. Ask: one soft, low-friction question ("worth a look?", "is this on your
   plate?", "who owns this at <company>?"). Never ask for 30 minutes in the
   first email. Never two questions.

Voice
- Write like a peer, not a vendor. Lowercase energy, short words, no adjectives
  stacked on your product. No "revolutionary", "seamless", "leverage",
  "synergy", "cutting-edge", "best-in-class", "excited", "thrilled".
- Zero exclamation marks. Zero ALL CAPS. No emoji.
- Say what you do in five plain words if you must say it at all.
- Sign with a first name only.

Sequence
- 3-4 touches over 10-14 days from the SAME mailbox, each a reply in-thread.
- Follow-ups add new information (a proof point, a relevant example, a
  different angle), never "just bumping this".
- Final touch is a graceful close that makes it easy to say no.
- Stop the moment they reply, bounce, or opt out; Scalar enforces the last two.

Deliverability (Scalar enforces the hard parts)
- Only send from mailboxes past their 14-day warmup; respect coldRemainingToday.
- Spread sends across mailboxes and across the day; never batch 30 at once.
- Verified emails only; catch-all addresses at reduced volume from the
  healthiest mailbox.
- Unsubscribe: honour any "stop" or "remove me" immediately (Scalar marks the
  contact do-not-contact on classifier UNSUBSCRIBE).`;

export interface ColdEmailLint {
  wordCount: number;
  warnings: string[];
  /** 0-100: 100 means no warnings. Purely heuristic. */
  score: number;
}

const SPAM_PHRASES = [
  "i hope this finds you well",
  "hope this email finds you well",
  "hope you're doing well",
  "hope you are doing well",
  "my name is",
  "i wanted to reach out",
  "reaching out",
  "touch base",
  "just following up",
  "just bumping",
  "circle back",
  "quick question",
  "revolutionary",
  "seamless",
  "leverage",
  "synergy",
  "cutting-edge",
  "cutting edge",
  "best-in-class",
  "best in class",
  "game-changing",
  "game changing",
  "i'm excited",
  "we're excited",
  "thrilled",
  "free trial",
  "limited time",
  "act now",
  "no obligation",
  "guarantee",
  "100%",
  "risk-free",
  "click here",
  "30 minutes",
  "15 minutes",
  "hop on a call",
  "jump on a call",
];

const BURNED_SUBJECTS = ["quick question", "following up", "follow up", "checking in", "touching base", "introduction", "partnership", "re: ", "fwd: "];

const URL_RE = /https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}|\b[a-z0-9-]+\.(com|io|co|ai|net|org)\/[^\s]*/i;

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Heuristic review of a cold email draft. `isReply` relaxes the rules that
 *  only apply to a first touch (links, subject line, "Re:"). */
export function lintColdEmail(input: { subject: string; text: string; html?: string | null; isReply?: boolean }): ColdEmailLint {
  const warnings: string[] = [];
  const subject = input.subject.trim();
  const text = input.text.trim();
  const lower = text.toLowerCase();
  const wc = words(text);

  if (!input.isReply) {
    if (wc > 120) warnings.push(`Body is ${wc} words; cold first touches land best under 75.`);
    else if (wc > 75) warnings.push(`Body is ${wc} words; aim for under 75.`);
    if (wc < 15) warnings.push("Body is very short; make sure it still carries one concrete observation and one ask.");

    if (URL_RE.test(text)) warnings.push("Contains a link. Links in a cold first touch are the strongest spam signal; save them for the reply.");
    if (input.html && input.html.trim()) warnings.push("HTML body supplied. Plain text places better and reads more like a person.");

    const sw = words(subject);
    if (sw > 6) warnings.push(`Subject is ${sw} words; keep it to 2-5.`);
    if (BURNED_SUBJECTS.some((b) => subject.toLowerCase().startsWith(b) || subject.toLowerCase() === b.trim())) {
      warnings.push(`Subject "${subject}" is a burned pattern; make it specific to the recipient.`);
    }
    if (/[!]/.test(subject)) warnings.push("Subject has an exclamation mark.");
    if (subject === subject.toUpperCase() && /[A-Z]/.test(subject)) warnings.push("Subject is all caps.");
  }

  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations > 0) warnings.push(`${exclamations} exclamation mark${exclamations === 1 ? "" : "s"}; use none.`);

  const capsWords = text.match(/\b[A-Z]{4,}\b/g) ?? [];
  const capsNonAcronym = capsWords.filter((w) => !["HTML", "SaaS", "CRM", "API", "SDR", "CEO", "CTO", "CFO", "COO", "VP", "USD", "EU", "US"].includes(w));
  if (capsNonAcronym.length > 1) warnings.push(`Shouty words: ${[...new Set(capsNonAcronym)].slice(0, 4).join(", ")}.`);

  const questions = (text.match(/\?/g) ?? []).length;
  if (questions > 1 && !input.isReply) warnings.push(`${questions} questions; ask exactly one.`);
  if (questions === 0 && !input.isReply) warnings.push("No question. End with one soft, low-friction ask.");

  const hits = SPAM_PHRASES.filter((p) => lower.includes(p));
  if (hits.length) warnings.push(`Vendor-speak or spam-trigger phrases: ${hits.slice(0, 5).map((h) => `"${h}"`).join(", ")}.`);

  // Emoji (rough: anything in the supplementary planes or common symbol blocks).
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text) || /[\u{1F300}-\u{1FAFF}]/u.test(subject)) warnings.push("Contains emoji.");

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (!input.isReply && paragraphs.length > 5) warnings.push(`${paragraphs.length} paragraphs; three short lines is the target.`);

  if (/\{\{|\}\}|\[first name\]|\[company\]|\{first_name\}|\{company\}/i.test(text + subject)) {
    warnings.push("Unfilled merge field detected ({{...}} or [first name]).");
  }

  const score = Math.max(0, 100 - warnings.length * 12);
  return { wordCount: wc, warnings, score };
}
