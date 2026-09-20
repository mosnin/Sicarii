// Voice intent bridge - turns a transcribed inbound-call request into a
// grounded, spoken-friendly CRM summary. Mirrors the shape of
// src/lib/intent-router.ts (a menu of intents + a no-LLM heuristic classifier)
// but is scoped to the operator's OWN CRM instead of external discovery: the
// operator calls their AgentPhone number and asks things like "who do I need
// to follow up with today" or "what did my agent do while I was away".
//
// Hard rules:
// - Every answer is grounded in real rows from the shared ops layer
//   (crm-operations.ts / pulse.ts) - never fabricated, matching the
//   enrichment accuracy rule for the rest of the product.
// - Speech is plain sentences, no markdown, no bullet points, numbers
//   rounded/whole, and capped to a handful of items - this text gets read
//   aloud by AgentPhone, not rendered.
// - Never throws: any op failure degrades to a short, honest spoken fallback
//   (console.warn'd) rather than crashing the call.

import { prisma } from "@/lib/prisma";
import { listDueFollowups, listContacts, searchCrm } from "@/lib/crm-operations";
import { computePulse } from "@/lib/pulse";

export type VoiceIntentId = "followups" | "pulse" | "pipeline_hot" | "search" | "unknown";

// The intent menu, kept in the same { id, purpose } shape as intent-router's
// TOOLS so the pattern is recognizable across the codebase.
export const VOICE_INTENTS: { id: VoiceIntentId; purpose: string }[] = [
  { id: "followups", purpose: "Who needs a follow-up today - who to chase, who hasn't replied, who's overdue." },
  { id: "pulse", purpose: "What happened / what the agent did while the operator was away - a recent-activity summary." },
  { id: "pipeline_hot", purpose: "What's hot in the pipeline - qualified or replied leads worth a look." },
  { id: "search", purpose: "Look up one named person or company in the CRM." },
  { id: "unknown", purpose: "Fallback when nothing matches - offer the operator the menu of things Scalar can answer." },
];

const MAX_NAMED_ITEMS = 3;

/**
 * Heuristic router for voice requests. Never dead-ends (falls through to
 * "unknown", which produces a helpful spoken menu rather than an error).
 * Keyword alternatives are `\b`-anchored so a substring of an unrelated word
 * can't mis-route (same discipline as intent-router's heuristicRoute).
 */
export function classifyVoiceIntent(text: string): { intent: VoiceIntentId; query?: string } {
  const t = (text || "").toLowerCase().trim();
  if (!t) return { intent: "unknown" };

  if (
    /\b(follow[\s-]?up|followups|due|overdue|chase|chasing|haven'?t (replied|responded|heard)|need to (contact|call|email|reach out))\b/.test(
      t,
    )
  ) {
    return { intent: "followups" };
  }
  if (
    /\b(while i was away|what happened|what did (my agent|it|you) do|catch me up|pulse|update me|what'?s new|been up to)\b/.test(
      t,
    )
  ) {
    return { intent: "pulse" };
  }
  if (/\b(hot|pipeline|best leads|qualified|top deals|what'?s cooking|worth (a )?look)\b/.test(t)) {
    return { intent: "pipeline_hot" };
  }
  if (/\b(who is|what is|tell me about|look up|find|search for|do (i|we) have)\b/.test(t)) {
    return { intent: "search", query: extractSearchQuery(t) };
  }
  return { intent: "unknown" };
}

// Strip the leading trigger phrase so "who is jane at acme" -> "jane at acme".
const SEARCH_TRIGGERS =
  /\b(who is|what is|tell me about|look up|find|search for|do i have|do we have)\b\s*/i;

function extractSearchQuery(t: string): string {
  const stripped = t.replace(SEARCH_TRIGGERS, "").trim();
  return stripped.slice(0, 200);
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Who needs a follow-up today, spoken. */
async function speakFollowups(userId: string): Promise<string> {
  const due = await listDueFollowups(userId, { limit: 10 });
  if (due.length === 0) {
    return "You have no follow-ups due right now. You're all caught up.";
  }
  const names = due
    .slice(0, MAX_NAMED_ITEMS)
    .map((c) => c.name?.trim() || c.company?.trim() || c.email?.trim() || "an unnamed contact");
  const list = joinNames(names);
  const more = due.length > MAX_NAMED_ITEMS ? `, and ${due.length - MAX_NAMED_ITEMS} more` : "";
  return `You have ${due.length} follow-up${due.length === 1 ? "" : "s"} due. Top of the list: ${list}${more}.`;
}

/** What the agent did while the operator was away, spoken. Grounded in the
 *  same computePulse() the dashboard uses - never brags an empty window. */
async function speakPulse(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastSeenAt: true } });
  const since = user?.lastSeenAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pulse = await computePulse(userId, since);
  if (!pulse) {
    return "Nothing new since you last checked in. Your agent is still watching.";
  }
  const parts: string[] = [];
  if (pulse.companies > 0) parts.push(`${pulse.companies} new compan${pulse.companies === 1 ? "y" : "ies"}`);
  if (pulse.enriched > 0) parts.push(`${pulse.enriched} record${pulse.enriched === 1 ? "" : "s"} enriched`);
  if (pulse.inMarket > 0) parts.push(`${pulse.inMarket} in-market signal${pulse.inMarket === 1 ? "" : "s"}`);
  const body = parts.length > 0 ? `Your agent added ${joinNames(parts)}.` : "Your agent has been working quietly.";
  const best = pulse.best?.name ? ` The best find was ${pulse.best.name}.` : "";
  return `${body}${best}`;
}

/** What's hot in the pipeline, spoken. Qualified leads first, replied leads
 *  as the fallback pool when nothing is qualified yet. */
async function speakPipelineHot(userId: string): Promise<string> {
  const qualified = await listContacts(userId, { status: "QUALIFIED", limit: 10 });
  const pool = qualified.length > 0 ? qualified : await listContacts(userId, { status: "REPLIED", limit: 10 });
  if (pool.length === 0) {
    return "Nothing marked hot in your pipeline right now.";
  }
  const label = qualified.length > 0 ? "qualified" : "replied";
  const names = pool.slice(0, MAX_NAMED_ITEMS).map((c) => c.name?.trim() || c.company?.trim() || "an unnamed contact");
  const list = joinNames(names);
  return `You have ${pool.length} ${label} contact${pool.length === 1 ? "" : "s"} in play. Leading the pack: ${list}.`;
}

/** Look up one named person or company, spoken. */
async function speakSearch(userId: string, rawQuery: string): Promise<string> {
  const query = rawQuery.trim().slice(0, 200);
  if (!query) {
    return "Who or what company would you like me to look up?";
  }
  const { entities, contacts } = await searchCrm(userId, query);
  const total = entities.length + contacts.length;
  if (total === 0) {
    return `I couldn't find anything matching ${query} in your CRM.`;
  }
  const top = contacts[0]?.name?.trim() || entities[0]?.name?.trim();
  const detail = top ? ` Top match: ${top}.` : "";
  return `I found ${total} match${total === 1 ? "" : "es"} for ${query}.${detail}`;
}

const HELP_SPEECH =
  "I can tell you about follow-ups due, what's hot in your pipeline, or catch you up on recent activity. What would you like to know?";
const NO_INPUT_SPEECH =
  "I didn't catch that. You can ask about follow-ups, your pipeline, or what happened recently.";
const OP_FAILED_SPEECH = "I couldn't pull that up right now. Please try again in a moment.";

/**
 * The bridge entry point: transcribed text + a resolved, already-authenticated
 * userId -> a short spoken summary grounded in that user's real CRM data.
 * Never throws - every failure path degrades to a safe, honest sentence.
 */
export async function voiceIntent(
  userId: string,
  rawText: string,
): Promise<{ speech: string; intent: VoiceIntentId }> {
  const text = typeof rawText === "string" ? rawText.trim().slice(0, 2000) : "";
  if (!text) {
    return { speech: NO_INPUT_SPEECH, intent: "unknown" };
  }

  const { intent, query } = classifyVoiceIntent(text);
  try {
    switch (intent) {
      case "followups":
        return { intent, speech: await speakFollowups(userId) };
      case "pulse":
        return { intent, speech: await speakPulse(userId) };
      case "pipeline_hot":
        return { intent, speech: await speakPipelineHot(userId) };
      case "search":
        return { intent, speech: await speakSearch(userId, query ?? text) };
      default:
        return { intent: "unknown", speech: HELP_SPEECH };
    }
  } catch (e) {
    console.warn(`[voice-intent] op failed for intent=${intent}, degrading to safe fallback`, e);
    return { intent, speech: OP_FAILED_SPEECH };
  }
}
