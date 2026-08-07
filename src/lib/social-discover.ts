// The DISCOVERY path: watch a topic, and produce something a human decides on.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
//
// A query-based social search result must NEVER create or update a Contact or
// an Entity. SocQ has no identity resolution: no endpoint accepts an email or a
// company domain, and no output carries a confidence, a match score, a
// candidate array or a verification flag. There is therefore nothing to
// threshold on, and attaching result[0] to a person is precisely the
// same-name-stranger bug Scalar refuses to ship.
//
// So everything a monitor finds lands in SocialOpportunity, a review queue, and
// becomes a CRM record only when a human explicitly converts it against an
// identity THEY already verified (see src/lib/social-opportunities.ts).
//
// This is enforced structurally, not by convention: THIS MODULE NEVER TOUCHES
// prisma.contact OR prisma.entity, for reads or for writes, and a test asserts
// that by scanning the source. If you find yourself needing a contact here, you
// are on the wrong path; the conversion path is the other module.
//
// SocQ also returns no sentiment and no intent of any kind, so the intent score
// below is ours, computed in our own LLM layer, grounded ONLY in the text of
// the post. Never in anything about the author.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { type Prisma, type SocialMonitor, type SocialPlatform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { ensureCredits, spendCredits } from "@/lib/credits";
import {
  COMMUNITY_ENDPOINTS,
  SEARCH_ENDPOINTS,
  clampResultsLimit,
  enqueueSocqPoll,
  resolveEndpoint,
  submitTask,
  type SocialPlatformKey,
  type SocqItem,
} from "@/lib/socq";

const MODEL = process.env.OPENAI_SOCIAL_INTENT_MODEL ?? "gpt-5-mini";

/** A monitor run is capped well below the SocQ ceiling. Discovery is the one
 *  path where a big number is tempting and useless: nobody reviews 500 posts. */
export const MONITOR_RESULTS_CEILING = 50;

/** How many opportunities one run classifies. Classification is an LLM call;
 *  a run that found more than this leaves the rest unscored rather than
 *  spending without a bound, and the next run picks them up. */
export const MAX_CLASSIFY_PER_RUN = 25;

/* --------------------------------------------------------------------------
 * Scheduling
 * ----------------------------------------------------------------------- */

export function nextRunFor(now: Date, frequency: string | null | undefined): Date {
  const ms =
    frequency === "hourly" ? 60 * 60_000
      : frequency === "weekly" ? 7 * 24 * 60 * 60_000
        : 24 * 60 * 60_000; // daily default
  return new Date(now.getTime() + ms);
}

/* --------------------------------------------------------------------------
 * Submitting a monitor run
 * ----------------------------------------------------------------------- */

export interface MonitorRunSubmission {
  monitorId: string;
  endpoint: string;
  socqTaskId: string;
  resultsLimit: number;
  replayed: boolean;
}

/** Pick the endpoint a monitor should call, and refuse loudly where SocQ
 *  simply cannot do what the operator is imagining. */
export async function resolveMonitorEndpoint(monitor: {
  platform: SocialPlatform;
  query: string | null;
  sourceUrls: string[];
}): Promise<{ platform: string; resource: string; publicId: string; input: Record<string, unknown> }> {
  const key = monitor.platform as SocialPlatformKey;

  if (monitor.sourceUrls.length > 0) {
    const candidates = COMMUNITY_ENDPOINTS[key];
    if (!candidates) {
      throw new OpError(
        `SocQ cannot watch ${monitor.platform} communities from URLs. Community watching is available for Facebook groups, Reddit subreddits and X lists only.`,
        400,
      );
    }
    const endpoint = await resolveEndpoint(candidates);
    return { ...endpoint, input: { urls: monitor.sourceUrls.slice(0, 20) } };
  }

  if (!monitor.query || !monitor.query.trim()) {
    throw new OpError("This monitor has neither a query nor any source URLs, so there is nothing to watch.", 400);
  }

  if (monitor.platform === "LINKEDIN") {
    throw new OpError(
      "LinkedIn cannot be searched. All four of SocQ's LinkedIn endpoints require exact profile or post URLs; there is no LinkedIn search of any kind. Watch another platform, or hydrate a LinkedIn profile you already hold.",
      400,
    );
  }
  if (monitor.platform === "FACEBOOK") {
    throw new OpError(
      "Facebook keyword search is not available. SocQ can read posts from Facebook GROUP URLs you already have, but there is no group discovery endpoint, so we cannot go and find groups about a topic. Add the group URLs to this monitor.",
      400,
    );
  }

  const candidates = SEARCH_ENDPOINTS[key];
  if (!candidates) {
    throw new OpError(`SocQ has no keyword search for ${monitor.platform}.`, 400);
  }
  const endpoint = await resolveEndpoint(candidates);
  return { ...endpoint, input: { query: monitor.query.trim().slice(0, 500) } };
}

/**
 * Submit one run of a monitor. Returns as soon as SocQ accepts; the results
 * arrive later through the socq_poll handler, which calls
 * applyDiscoveryItems() below.
 */
export async function runSocialMonitor(
  userId: string,
  monitorId: string,
  opts: { now?: Date } = {},
): Promise<MonitorRunSubmission> {
  const now = opts.now ?? new Date();
  const monitor = await prisma.socialMonitor.findFirst({ where: { id: monitorId, userId } });
  if (!monitor) throw new OpError("Monitor not found", 404);
  if (!monitor.active) throw new OpError("This monitor is paused.", 409);

  // Gate before the paid provider call. The debit lands once opportunities are
  // actually written, so a run that finds nothing is not charged.
  await ensureCredits(userId, "monitor_run");

  const endpoint = await resolveMonitorEndpoint(monitor);
  const resultsLimit = clampResultsLimit(monitor.resultsLimit, MONITOR_RESULTS_CEILING);
  const input: Record<string, unknown> = { ...endpoint.input };
  if (monitor.publishedWithin) input.published_within = monitor.publishedWithin;

  const task = await submitTask(userId, {
    platform: endpoint.platform,
    resource: endpoint.resource,
    input,
    purpose: `Social monitor "${monitor.name}" looking for buying signals to review`,
    monitorId: monitor.id,
    resultsLimit,
    resultsLimitCeiling: MONITOR_RESULTS_CEILING,
    // A monitor asks the same question on a schedule, and each cycle is a new
    // question in billing terms. Without a per-cycle salt the idempotency key
    // would replay yesterday's answers forever.
    idempotencySalt: `monitor:${monitor.id}:${now.toISOString().slice(0, 13)}`,
  });

  await enqueueSocqPoll(
    userId,
    { socqTaskId: task.socqTaskId, mode: "discover", attempt: 0, platform: monitor.platform, monitorId: monitor.id },
    { reason: `Collect what the "${monitor.name}" social watch found, so you can review it instead of us guessing who it is.` },
  );

  await prisma.socialMonitor.update({
    where: { id: monitor.id },
    data: { lastRunAt: now, nextRunAt: nextRunFor(now, monitor.frequency) },
  });

  return {
    monitorId: monitor.id,
    endpoint: endpoint.publicId,
    socqTaskId: task.socqTaskId,
    resultsLimit,
    replayed: task.replayed,
  };
}

/** Monitors that are due, oldest first. The dispatcher seeds from this. */
export function dueMonitors(now: Date, limit = 200): Promise<SocialMonitor[]> {
  return prisma.socialMonitor.findMany({
    where: { active: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
    orderBy: { nextRunAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}

/* --------------------------------------------------------------------------
 * Writing opportunities
 * ----------------------------------------------------------------------- */

export interface DiscoveryWriteResult {
  found: number;
  created: number;
  duplicates: number;
  skipped: number;
  classified: number;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

/**
 * Turn a finished discovery task into SocialOpportunity rows.
 *
 * Dedupe is the storage layer's job: SocialOpportunity is unique on
 * [userId, postUrl] and we insert with skipDuplicates, so a post seen by two
 * monitors, or by the same monitor twice, never produces a second row and
 * never resets a row a human has already dismissed or converted.
 */
export async function applyDiscoveryItems(
  userId: string,
  input: { monitorId: string | null; platform: SocialPlatform; items: SocqItem[] },
): Promise<DiscoveryWriteResult> {
  const rows: Prisma.SocialOpportunityCreateManyInput[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const item of input.items) {
    // No URL means no dedupe key and nothing a human could go and look at.
    if (!item.url) {
      skipped++;
      continue;
    }
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    rows.push({
      userId,
      monitorId: input.monitorId,
      platform: input.platform,
      postUrl: item.url,
      text: item.text,
      // The author blob is stored RAW and never parsed into a person. It is
      // context for a human reviewer, not an identity claim.
      authorRaw: asJson(item.author.raw),
      publishedAt: item.publishedAt,
      metrics: item.metrics ? asJson(item.metrics) : undefined,
    });
  }

  const created = rows.length
    ? await prisma.socialOpportunity.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };

  const classified = await classifyNewOpportunities(userId, {
    postUrls: rows.map((r) => r.postUrl),
  });

  if (created.count > 0) {
    // Charge once per run that actually produced something.
    await spendCredits(userId, "monitor_run", { ref: input.monitorId ?? undefined }).catch((e) => {
      console.warn("[social-discover] credit debit failed", e);
    });
  }

  return {
    found: input.items.length,
    created: created.count,
    duplicates: rows.length - created.count,
    skipped,
    classified,
  };
}

/* --------------------------------------------------------------------------
 * Intent classification, in our own LLM layer
 * ----------------------------------------------------------------------- */

const intentSchema = z.object({
  scores: z
    .array(
      z.object({
        index: z.number().int().describe("The index of the post as numbered in the list"),
        intentScore: z
          .number()
          .int()
          .min(0)
          .max(100)
          .describe("0 means no buying intent at all, 100 means explicitly asking to buy right now"),
        intentReason: z
          .string()
          .max(240)
          .describe("One line quoting or paraphrasing ONLY what the post text itself says. Never mention the author."),
      }),
    )
    .describe("One entry per post, in the same order"),
});

export interface IntentJudgement {
  postUrl: string;
  intentScore: number;
  intentReason: string;
}

/**
 * Score buying intent from post text alone.
 *
 * HARD RULE, and the reason this lives in our layer at all: SocQ returns no
 * sentiment and no intent, so anything we show has to be ours and has to be
 * grounded. The prompt is written the same way the breakup drafter's is (see
 * src/lib/breakup-operations.ts): the model is told, explicitly, that the post
 * text is the ONLY evidence, that it must never infer anything about the
 * author, and that an empty or unreadable post is a zero rather than a guess.
 */
export async function judgeIntent(
  posts: { postUrl: string; text: string | null }[],
): Promise<IntentJudgement[]> {
  const usable = posts.filter((p) => (p.text ?? "").trim().length > 0);
  const empty: IntentJudgement[] = posts
    .filter((p) => (p.text ?? "").trim().length === 0)
    .map((p) => ({
      postUrl: p.postUrl,
      intentScore: 0,
      intentReason: "No post text came back from the provider, so there is nothing to judge.",
    }));

  if (usable.length === 0 || !process.env.OPENAI_API_KEY) return empty;

  const numbered = usable
    .map((p, i) => `[${i}] ${(p.text ?? "").replace(/\s+/g, " ").slice(0, 800)}`)
    .join("\n");

  const { object } = await generateObject({
    model: openai(MODEL),
    schema: intentSchema,
    prompt: `You are scoring social posts for BUYING INTENT so a salesperson can decide which ones are worth reading.

HARD RULES, and they are the whole job:
- The post text below is the ONLY evidence you have. Score what it says, nothing else.
- You know NOTHING about who wrote any of these posts. Never infer a job title, a company, a budget, a seniority, a location or an identity. Never mention the author in your reason.
- Never invent a detail that is not in the text. If the text is vague, that is a LOW score, not a guess.
- The reason must be one short line a human can check against the text in two seconds. Quote or closely paraphrase the text.

How to score:
- 80-100: explicitly asking for a recommendation, a vendor, a tool, a quote, or saying they are switching or buying now.
- 50-79: describing a concrete problem that a product plainly solves, or complaining about a current tool by name.
- 20-49: topically relevant but no stated need.
- 0-19: no commercial signal at all, or the text is too thin to tell.

Posts:
${numbered}

Return one entry per post, using the [index] shown.`,
  });

  const byIndex = new Map(object.scores.map((s) => [s.index, s]));
  const judged: IntentJudgement[] = usable.map((p, i) => {
    const hit = byIndex.get(i);
    return {
      postUrl: p.postUrl,
      intentScore: hit ? Math.min(Math.max(Math.trunc(hit.intentScore), 0), 100) : 0,
      intentReason: hit?.intentReason?.trim() || "The model returned no reason for this post, so it is unscored.",
    };
  });
  return [...judged, ...empty];
}

/** Score any of these posts that do not have a score yet, and save it. */
export async function classifyNewOpportunities(
  userId: string,
  input: { postUrls: string[] },
): Promise<number> {
  if (input.postUrls.length === 0) return 0;

  const pending = await prisma.socialOpportunity.findMany({
    where: { userId, postUrl: { in: input.postUrls }, intentScore: null },
    orderBy: { createdAt: "asc" },
    take: MAX_CLASSIFY_PER_RUN,
    select: { postUrl: true, text: true },
  });
  if (pending.length === 0) return 0;

  let judgements: IntentJudgement[];
  try {
    judgements = await judgeIntent(pending);
  } catch (e) {
    // A classification failure must not lose the opportunity itself. The row
    // stays unscored and the next run tries again.
    console.warn("[social-discover] intent classification failed", e);
    return 0;
  }

  let saved = 0;
  for (const judgement of judgements) {
    // updateMany, scoped by userId, so a postUrl can never reach another
    // tenant's row even though postUrl is unique per tenant.
    const res = await prisma.socialOpportunity.updateMany({
      where: { userId, postUrl: judgement.postUrl },
      data: { intentScore: judgement.intentScore, intentReason: judgement.intentReason.slice(0, 500) },
    });
    saved += res.count;
  }
  return saved;
}
