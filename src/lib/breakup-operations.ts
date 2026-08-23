// Stalled-deal "breakup" drafts - the shared ops layer, same userId-first +
// OpError ownership-check convention as src/lib/crm-operations.ts. Every
// caller (REST routes, the MCP server, the in-app agent) goes through here.
//
// The feature: when a deal goes cold, Scalar notices it, drafts a polite
// "breakup" pattern-interrupt email grounded ONLY in the contact's real
// activity/email history, and holds it PENDING for one-click human approval.
// It is never auto-sent - see docs/decisions/0012-breakup-drafts.md.
//
// Approve/dismiss are intentionally NOT exposed here as anything an agent can
// reach unsupervised: they are called only from human-session-gated REST
// routes (src/app/api/breakup-drafts/**), never from the MCP server or the
// in-app agent, so a prompt-injected agent cannot approve (and thereby send)
// its own drafts.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, type BreakupDraftStatus, type ContactStatus, type ConversationStatus } from "@prisma/client";
import { OpError, logOutreach, clampListLimit } from "@/lib/crm-operations";
import { ensureCredits, spendCredits } from "@/lib/credits";

const MODEL = process.env.OPENAI_BREAKUP_MODEL ?? "gpt-5-mini";

// A deal is "cold" once it has gone this many days without a touch. Callers
// (MCP/agent/REST) may override within STALE_DAYS_BOUNDS.
export const DEFAULT_STALE_DAYS = 14;
const STALE_DAYS_BOUNDS = { min: 1, max: 365 };

// Contact.status values that mean "still actively being worked" enough to be
// breakup-worthy. WON/LOST/ARCHIVED are excluded (already resolved) as is
// QUALIFIED/NEW/ENRICHED (no outreach relationship to break up yet).
const STALLED_CONTACT_STATUSES: ContactStatus[] = ["CONTACTED", "REPLIED"];
// PipelineEntry.conversationStatus values that independently signal a stall,
// even if the contact's own status hasn't caught up (e.g. QUALIFIED with a
// stalled pipeline entry).
const STALLED_CONVERSATION_STATUSES: ConversationStatus[] = ["STALLED", "AWAITING_REPLY"];
const CLOSED_STATUSES: ContactStatus[] = ["WON", "LOST", "ARCHIVED"];

function clampStaleDays(days?: number): number {
  if (days == null || !Number.isFinite(days)) return DEFAULT_STALE_DAYS;
  return Math.min(Math.max(Math.trunc(days), STALE_DAYS_BOUNDS.min), STALE_DAYS_BOUNDS.max);
}

/* ---------------------------- Cold detection ------------------------- */

export interface StalledDeal {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  status: string;
  lastContactedAt: Date | null;
}

/** Find stalled deals for this tenant: contacts in CONTACTED/REPLIED (or with a
 *  pipeline entry stuck in STALLED/AWAITING_REPLY) that have gone `staleDays`
 *  without a touch, excluding anything already resolved (WON/LOST/ARCHIVED) or
 *  whose pipeline entry is already CLOSED. Oldest touch first - the coldest
 *  deal is the most overdue for a breakup. */
export function listStalledDeals(
  userId: string,
  input: { staleDays?: number; limit?: number } = {},
): Promise<StalledDeal[]> {
  const staleDays = clampStaleDays(input.staleDays);
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  return prisma.contact.findMany({
    where: {
      userId,
      // A breakup email needs a real last-touch to reference; a contact that
      // was never actually contacted has no relationship to break up.
      lastContactedAt: { lt: cutoff },
      status: { notIn: CLOSED_STATUSES },
      OR: [
        { status: { in: STALLED_CONTACT_STATUSES } },
        { pipelineEntries: { some: { conversationStatus: { in: STALLED_CONVERSATION_STATUSES } } } },
      ],
      // Don't resurrect a deal the pipeline already closed out.
      pipelineEntries: { none: { conversationStatus: "CLOSED" } },
    },
    orderBy: { lastContactedAt: "asc" },
    take: clampListLimit(input.limit),
    select: { id: true, name: true, email: true, company: true, status: true, lastContactedAt: true },
  });
}

/* ---------------------------- Draft generation ------------------------ */

async function assertContactOwned(userId: string, contactId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  return contact;
}

// Pull the real, stored history to ground the draft in - never anything
// invented. Capped the same way getContact/listActivities cap: enough to write
// a specific email, not so much it blows the prompt.
async function groundingHistory(contactId: string) {
  const [activities, emails, socialMessages] = await Promise.all([
    prisma.activity.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, kind: true, body: true, channel: true, createdAt: true },
    }),
    prisma.contactEmail.findMany({
      where: { contactId },
      orderBy: { sentAt: "desc" },
      take: 10,
      select: { id: true, direction: true, subject: true, body: true, sentAt: true },
    }),
    prisma.contactSocialMessage.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, channel: true, direction: true, body: true, createdAt: true },
    }),
  ]);
  return { activities, emails, socialMessages };
}

function formatHistoryForPrompt(history: Awaited<ReturnType<typeof groundingHistory>>): string {
  const lines: string[] = [];
  for (const a of history.activities) {
    lines.push(`[activity ${a.kind}${a.channel ? `/${a.channel}` : ""} ${a.createdAt.toISOString().slice(0, 10)}] ${(a.body ?? "").slice(0, 400)}`);
  }
  for (const e of history.emails) {
    const when = (e.sentAt ?? undefined)?.toISOString().slice(0, 10) ?? "unknown date";
    lines.push(`[email ${e.direction} ${when}] subject: ${e.subject ?? "(no subject)"} - ${(e.body ?? "").slice(0, 400)}`);
  }
  for (const s of history.socialMessages) {
    lines.push(`[social ${s.channel}/${s.direction} ${s.createdAt.toISOString().slice(0, 10)}] ${s.body.slice(0, 400)}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(no stored activity, email, or social history for this contact)";
}

const draftSchema = z.object({
  subject: z.string().describe("A short, specific, non-generic subject line for the breakup email"),
  body: z.string().describe(
    "The full breakup email body: a polite pattern-interrupt (\"I'll assume the timing isn't right and close this out - let me know if that's wrong\"), short and specific to the real relationship history, never generic filler",
  ),
  reasoning: z.string().describe("One or two sentences on what history this draft is grounded in and why now"),
});

export interface BreakupDraftResult {
  id: string;
  contactId: string;
  status: BreakupDraftStatus;
  subject: string;
  body: string;
  createdAt: Date;
  alreadyExisted: boolean;
}

/** Generate (or return the existing) pending breakup draft for one contact.
 *  Grounded ONLY in stored activity/email/social history - the hard accuracy
 *  rule (never fabricate facts about the person/relationship; see AGENTS.md)
 *  applies here exactly as it does to enrichment. Idempotent: a contact with
 *  an existing PENDING draft is returned as-is, never regenerated or charged
 *  twice. */
export async function generateBreakupDraft(
  userId: string,
  contactId: string,
): Promise<BreakupDraftResult> {
  const contact = await assertContactOwned(userId, contactId);

  const existing = await prisma.breakupDraft.findFirst({
    where: { userId, contactId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return {
      id: existing.id,
      contactId: existing.contactId,
      status: existing.status,
      subject: existing.subject,
      body: existing.body,
      createdAt: existing.createdAt,
      alreadyExisted: true,
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new OpError("Breakup drafting needs OPENAI_API_KEY", 501);
  }

  // Gate before the paid OpenAI call; debit below only on a successful,
  // persisted draft (never charge a miss).
  await ensureCredits(userId, "breakup_draft");

  const history = await groundingHistory(contactId);
  const historyText = formatHistoryForPrompt(history);
  const staleFor = contact.lastContactedAt
    ? Math.floor((Date.now() - contact.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const { object: draft } = await generateObject({
    model: openai(MODEL),
    schema: draftSchema,
    prompt: `You are Scalar's outreach agent, writing a "breakup" email for a stalled sales conversation. A breakup email is a polite pattern-interrupt: something like "I'll assume the timing isn't right and I'll close this out on my end - if that's wrong, just let me know" - it should sound human, brief, and low-pressure, never desperate or pushy.

HARD RULE: ground the email ONLY in the real stored history below. Never invent facts, meetings, promises, product names, or details that are not present in the history or the contact record. If the history is sparse, write a short, general breakup email rather than inventing specifics. Prefer omitting a detail over guessing it.

Contact: ${contact.name ?? "(no name on file)"}${contact.title ? `, ${contact.title}` : ""}${contact.company ? ` at ${contact.company}` : ""}
Contact status: ${contact.status}
Days since last contact: ${staleFor ?? "unknown"}

Stored history with this contact (most recent first):
${historyText}

Write a short, specific, non-generic breakup email (subject + body) grounded in the above. Sign off simply (no invented sender name unless one appears in the history).`,
  });

  const generatedFrom = {
    staleDays: staleFor,
    lastContactedAt: contact.lastContactedAt ? contact.lastContactedAt.toISOString() : null,
    contactStatus: contact.status,
    reasoning: draft.reasoning,
    groundedIn: {
      activityIds: history.activities.map((a) => a.id),
      emailIds: history.emails.map((e) => e.id),
      socialMessageIds: history.socialMessages.map((s) => s.id),
    },
    model: MODEL,
    generatedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonValue;

  const created = await prisma.breakupDraft.create({
    data: {
      userId,
      contactId,
      status: "PENDING",
      subject: draft.subject,
      body: draft.body,
      generatedFrom,
    },
  });

  // Debit only after the draft is generated AND persisted.
  await spendCredits(userId, "breakup_draft", { ref: contactId });

  return {
    id: created.id,
    contactId: created.contactId,
    status: created.status,
    subject: created.subject,
    body: created.body,
    createdAt: created.createdAt,
    alreadyExisted: false,
  };
}

export interface DraftBreakupsResult {
  scanned: number;
  drafted: number;
  skipped: number;
  staleDays: number;
  errors: { contactId: string; message: string }[];
}

/** Scan for cold deals and generate pending drafts for them, bounded to
 *  `limit` contacts per call so one call can't run away spending credits.
 *  Stops early (rather than erroring the whole batch) if credits run out
 *  mid-scan, so partial progress is still returned. */
export async function draftBreakups(
  userId: string,
  input: { staleDays?: number; limit?: number } = {},
): Promise<DraftBreakupsResult> {
  const staleDays = clampStaleDays(input.staleDays);
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const cold = await listStalledDeals(userId, { staleDays, limit });

  const errors: { contactId: string; message: string }[] = [];
  let drafted = 0;
  let skipped = 0;
  for (const deal of cold) {
    try {
      const result = await generateBreakupDraft(userId, deal.id);
      if (result.alreadyExisted) skipped++;
      else drafted++;
    } catch (e) {
      if (e instanceof OpError) {
        errors.push({ contactId: deal.id, message: e.message });
        if (e.status === 402) break; // out of credits - further attempts will fail too
        continue;
      }
      throw e;
    }
  }

  return { scanned: cold.length, drafted, skipped, staleDays, errors };
}

/* ------------------------------ Review queue --------------------------- */

export interface PendingDraft {
  id: string;
  status: BreakupDraftStatus;
  subject: string;
  body: string;
  createdAt: Date;
  contact: { id: string; name: string | null; email: string | null; company: string | null; status: string };
}

/** The review queue: pending drafts oldest first (the coldest deal has been
 *  waiting longest for a decision). */
export function listPendingDrafts(
  userId: string,
  input: { limit?: number } = {},
): Promise<PendingDraft[]> {
  return prisma.breakupDraft.findMany({
    where: { userId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: clampListLimit(input.limit),
    include: { contact: { select: { id: true, name: true, email: true, company: true, status: true } } },
  });
}

async function getOwnedDraft(userId: string, id: string) {
  const draft = await prisma.breakupDraft.findUnique({ where: { id } });
  if (!draft || draft.userId !== userId) throw new OpError("Draft not found", 404);
  return draft;
}

/** Edit a pending draft's subject/body before approving (a human refining
 *  Scalar's wording). Only PENDING drafts are editable. */
export async function updateBreakupDraft(
  userId: string,
  id: string,
  input: { subject?: string; body?: string },
) {
  const draft = await getOwnedDraft(userId, id);
  if (draft.status !== "PENDING") throw new OpError("This draft has already been decided", 409);
  const subject = input.subject?.trim();
  const body = input.body?.trim();
  if (subject === "" || body === "") throw new OpError("Subject and body cannot be empty", 400);
  return prisma.breakupDraft.update({
    where: { id },
    data: {
      ...(subject !== undefined ? { subject } : {}),
      ...(body !== undefined ? { body } : {}),
    },
  });
}

/** Approve a pending draft: human-session-gated ONLY (called from
 *  src/app/api/breakup-drafts/[id]/approve, which uses getAuthenticatedUser -
 *  a Clerk session - never an agent API key), so a prompt-injected agent can
 *  never approve, and thereby send, its own drafts.
 *
 *  AgentMail (src/lib/agentmail.ts) exposes no send capability today - it is
 *  read-only (getThreadsForContact). So approval always takes the honest
 *  fallback: mark the draft SENT and logOutreach (channel email) so the
 *  contact's pipeline state (status, lastContactedAt) advances for real. Once
 *  a live AgentMail send capability exists, this is the one seam to change:
 *  attempt the live send first, and only fall back to the logOutreach path on
 *  failure or when no send capability is configured. */
export async function approveBreakupDraft(userId: string, id: string) {
  const draft = await getOwnedDraft(userId, id);
  if (draft.status !== "PENDING") throw new OpError("This draft has already been decided", 409);

  // Owed to reality: no AgentMail send capability exists yet (see comment
  // above) - mark it ready and log the outreach honestly rather than
  // pretending it was delivered.
  await logOutreach(userId, {
    contactId: draft.contactId,
    summary: `Breakup email sent: "${draft.subject}"`,
    channel: "email",
  });

  return prisma.breakupDraft.update({
    where: { id },
    data: { status: "SENT", decidedAt: new Date() },
  });
}

/** Dismiss a pending draft: human-session-gated ONLY, same reasoning as
 *  approveBreakupDraft - never reachable from the MCP server or the in-app
 *  agent. */
export async function dismissBreakupDraft(userId: string, id: string) {
  const draft = await getOwnedDraft(userId, id);
  if (draft.status !== "PENDING") throw new OpError("This draft has already been decided", 409);
  return prisma.breakupDraft.update({
    where: { id },
    data: { status: "DISMISSED", decidedAt: new Date() },
  });
}
