// System prompt construction.
//
// The prompt is assembled from three sources and nothing else: the tenant's
// own product context, the CRM record of the person on the line, and the stated
// purpose of this one call. Anything not in those three is not known, and the
// agent is told so in the strongest terms the model will honor. A voice agent
// that invents a price or a meeting does not produce a bad transcript, it
// produces a commitment the founder has to walk back with a customer.

import type { CallDirection, ContactSummary, HistoryItem, TenantProfile } from "./tenant.js";

/**
 * Default disclosure. Several US states are two party consent, and GDPR
 * requires the caller to be told before recording, so this goes in the FIRST
 * thing said, not somewhere in the middle when it is legally too late.
 */
export const DEFAULT_RECORDING_DISCLOSURE = "This call is recorded.";

/** Spoken when we cannot identify the tenant and therefore must not talk about anything. */
export const FAILSAFE_LINE =
  "Sorry, I am not able to take this call right now. Please try again shortly. Goodbye.";

export interface PromptInput {
  tenant: TenantProfile;
  contact: ContactSummary | null;
  recentHistory: HistoryItem[];
  direction: CallDirection;
  purpose?: string | null;
  /** Operator supplied prompt from the job metadata. Added as guidance, never as an override of the hard rules. */
  operatorPrompt?: string | null;
  /** Overrides the default disclosure wording. The disclosure itself cannot be turned off. */
  recordingDisclosure?: string | null;
}

/** Below this many history items we treat the record as sparse and say less. */
export const SPARSE_HISTORY_THRESHOLD = 2;

export function resolveDisclosure(input: PromptInput): string {
  const custom = input.recordingDisclosure ?? input.tenant.recordingDisclosure;
  const text = custom?.trim();
  return text && text.length > 0 ? text : DEFAULT_RECORDING_DISCLOSURE;
}

/**
 * The first sentence the caller hears. Disclosure first, then who is calling,
 * then why. Short on purpose: the first five seconds decide whether the person
 * stays on the line.
 */
export function buildOpeningLine(input: PromptInput): string {
  const disclosure = resolveDisclosure(input);
  const company = input.tenant.displayName?.trim();
  const name = input.contact?.name?.trim().split(/\s+/)[0];

  const parts: string[] = [];
  if (input.direction === "OUTBOUND") {
    parts.push(name ? `Hi ${name},` : "Hi,");
    parts.push(company ? `this is the assistant calling from ${company}.` : "this is an assistant calling.");
  } else {
    parts.push(company ? `Thanks for calling ${company}.` : "Thanks for calling.");
  }
  parts.push(disclosure);
  parts.push(
    input.direction === "OUTBOUND"
      ? "Is now an alright time for a quick word?"
      : "How can I help?",
  );
  return parts.join(" ");
}

/** Voicemail is a different outcome from a conversation, so it gets its own short script. */
export function buildVoicemailLine(input: PromptInput): string {
  const company = input.tenant.displayName?.trim();
  const purpose = input.purpose?.trim();
  const who = company ? `the assistant from ${company}` : "an assistant";
  const why = purpose ? ` about ${purpose}` : "";
  return `Hi, this is ${who}${why}. Sorry to miss you. No need to call back, we will try again another time. Thanks.`;
}

export function buildSystemPrompt(input: PromptInput): string {
  const sections: string[] = [];

  sections.push(
    [
      "# Who you are",
      `You are a voice assistant making and taking phone calls on behalf of ${
        input.tenant.displayName?.trim() || "the business described below"
      }.`,
      "You are speaking out loud on a live telephone call. Everything you write is read aloud, so write speech, not text: no markdown, no bullet points, no emoji, no URLs, no spelling out punctuation.",
    ].join("\n"),
  );

  sections.push(
    [
      "# Hard rules, in order of priority",
      "1. Never invent anything. Do not state a fact, a price, a discount, a date, a meeting, a delivery time, a capability or a promise unless it appears verbatim in the context below. If you do not have it, say plainly that you do not have it and offer to have a person follow up.",
      "2. Never agree to anything on the business's behalf beyond arranging a follow up. You cannot sign, discount, refund, guarantee or commit.",
      "3. If the record below is sparse, say less. Do not fill silence with guesses about who this person is or what was discussed before. It is better to ask than to be confidently wrong.",
      `4. Say the recording disclosure in your very first sentence: "${resolveDisclosure(input)}". Do not wait to be asked and do not bury it later in the call.`,
      "5. If the person asks not to be called again, or asks you to stop, or asks for their data to be removed, acknowledge it immediately, confirm you will pass it on, log it, and end the call. Do not argue and do not try one more time.",
      "6. If the person asks whether you are a human, tell them plainly that you are an automated assistant.",
      "7. If the person becomes distressed, describes an emergency, or asks for something legal, medical or financial in nature, stop the script and offer a human.",
    ].join("\n"),
  );

  sections.push(
    [
      "# How you speak",
      "Short sentences. One question at a time. Wait for the answer.",
      "Aim for two sentences per turn, three at the very most. Nobody wants a paragraph read to them.",
      "Use plain spoken numbers: say twenty five dollars, not $25.",
      "If you are interrupted, stop and listen.",
      "If you did not hear something, ask once and move on. Do not ask twice.",
    ].join("\n"),
  );

  sections.push(productContextSection(input.tenant));
  sections.push(contactSection(input.contact));
  sections.push(historySection(input.recentHistory));
  sections.push(purposeSection(input));

  const operator = input.operatorPrompt?.trim();
  if (operator) {
    sections.push(
      [
        "# Additional instructions from the operator",
        "These add detail. They never override the hard rules above, and they never authorize inventing information.",
        operator,
      ].join("\n"),
    );
  }

  sections.push(
    [
      "# Tools",
      "You can look up the contact, read their recent history, log the outcome of this call, and schedule a follow up.",
      "Scheduling a follow up writes a durable record, so ask for and receive an explicit yes out loud before you do it, and repeat back the day and time you heard.",
      "Log the outcome once, near the end of the call, in one or two factual sentences. Record what was actually said, not what you hoped would be said.",
    ].join("\n"),
  );

  return sections.filter(Boolean).join("\n\n");
}

function productContextSection(tenant: TenantProfile): string {
  const context = tenant.productContext?.trim();
  if (!context) {
    // No product context is not a reason to improvise. It is a reason to be
    // narrower: the agent can still take a message, and nothing else.
    return [
      "# What this business does",
      "No product context has been supplied for this business.",
      "That means you do not know what they sell, what it costs, or what they can promise. Do not guess any of it. Introduce yourself, take a message, and offer to have a person follow up.",
    ].join("\n");
  }
  return [
    "# What this business does, in their own words",
    context,
    "Treat the above as the complete extent of what you know about this business. Anything not in it, you do not know.",
  ].join("\n");
}

function contactSection(contact: ContactSummary | null): string {
  if (!contact) {
    return [
      "# Who you are speaking to",
      "This number is not matched to anyone in the CRM. You do not know their name, their company or their history.",
      "Do not guess a name. Ask for one if you need it.",
    ].join("\n");
  }

  const lines: string[] = ["# Who you are speaking to"];
  const facts: string[] = [];
  if (contact.name) facts.push(`Name: ${contact.name}`);
  if (contact.title) facts.push(`Title: ${contact.title}`);
  if (contact.company) facts.push(`Company: ${contact.company}`);
  if (contact.status) facts.push(`CRM status: ${contact.status}`);
  if (contact.lastContactedAt) facts.push(`Last contacted: ${contact.lastContactedAt}`);
  if (contact.notes) facts.push(`Notes on file: ${contact.notes}`);

  if (facts.length === 0) {
    lines.push("A CRM record exists but it is effectively empty. Treat them as someone you have not met.");
  } else {
    lines.push(...facts);
    lines.push("These fields are the whole record. Do not extrapolate a relationship that is not written here.");
  }
  return lines.join("\n");
}

function historySection(history: HistoryItem[]): string {
  if (history.length === 0) {
    return [
      "# Recent history",
      "There is no recorded history with this person.",
      "Do not refer to a previous conversation, a previous email, or a previous call. As far as you know, none happened.",
    ].join("\n");
  }

  const lines = ["# Recent history, newest first"];
  for (const item of history) {
    const channel = item.channel ? ` via ${item.channel}` : "";
    lines.push(`- ${item.createdAt} ${item.kind}${channel}: ${item.body}`);
  }

  if (history.length < SPARSE_HISTORY_THRESHOLD) {
    lines.push(
      "This is a thin record. Refer to it only if the person raises it first, and say less rather than reconstructing what you cannot see.",
    );
  } else {
    lines.push("Refer only to what is listed here. Nothing else happened that you know of.");
  }
  return lines.join("\n");
}

function purposeSection(input: PromptInput): string {
  const purpose = input.purpose?.trim();
  if (input.direction === "INBOUND") {
    return [
      "# Why this call is happening",
      "They called you. Find out what they need, answer only from the context above, and take a message or arrange a follow up for anything else.",
    ].join("\n");
  }
  if (!purpose) {
    return [
      "# Why this call is happening",
      "No purpose was supplied for this outbound call.",
      "Introduce yourself, give the recording disclosure, ask whether now is a good time, and ask an open question about whether they would like someone to follow up. Do not manufacture a reason for calling.",
    ].join("\n");
  }
  return [
    "# Why this call is happening",
    `The purpose of this call is: ${purpose}`,
    "Get to that purpose within your first two turns. Once it is answered, thank them and end the call. Do not keep them on the line looking for more.",
  ].join("\n");
}
