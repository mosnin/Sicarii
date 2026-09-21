// Deterministic cold-outreach draft. No LLM: short, specific, one ask.
// Principles taken from public cold-email craft (one idea per mail, no
// pitch deck dump, a reply that takes five seconds). Used by the
// draft_outreach tool and as a fallback when the agent has no variant yet.

function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first || "there";
}

function oneLine(text: string, max = 220): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

export interface ColdDraftInput {
  contactName: string;
  company?: string | null;
  title?: string | null;
  productContext?: string | null;
  opener?: string | null;
  senderName?: string | null;
}

export interface ColdDraft {
  subject: string;
  body: string;
}

export function draftColdOutreach(input: ColdDraftInput): ColdDraft {
  const name = firstNameOf(input.contactName);
  const company = input.company?.trim();
  const title = input.title?.trim();
  const opener = input.opener?.trim();
  const product = oneLine(input.productContext ?? "", 160);
  const sender = input.senderName?.trim() || "Scalar";

  const who = [title, company].filter(Boolean).join(" at ");
  const subject = company
    ? `quick question about ${company}`
    : `quick question, ${name}`;

  const open = opener
    ? opener
    : who
      ? `Saw you ${title ? `as ${title}` : "working"}${company ? ` at ${company}` : ""} and figured this was worth a short note.`
      : `Wanted to send a short note rather than a long pitch.`;

  const offer = product
    ? `We help teams with ${product}.`
    : `We help operators run outbound from a CRM their agents already use.`;

  const body = `${name},

${open}

${offer} If that is even slightly relevant, is it worth 15 minutes this week? If not, a one-line "not now" is enough.

${sender}`;

  return { subject, body };
}

/** Soft check: cold mail should be short and have one question. */
export function outreachLooksHealthy(subject: string, body: string): string[] {
  const warnings: string[] = [];
  if (subject.length > 60) warnings.push("Subject is longer than 60 characters.");
  if (body.length > 900) warnings.push("Body is longer than a short cold email should be.");
  if (!body.includes("?")) warnings.push("Body has no question, so there is no easy reply.");
  if (/(dear sir|to whom it may concern|i hope this email finds you)/i.test(body)) {
    warnings.push("Body uses a generic opener. Rewrite it so it is specific.");
  }
  return warnings;
}
