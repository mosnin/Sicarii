// Social context + opportunity MCP tools, registered onto the shared Scalar MCP
// server by src/app/api/mcp/[transport]/route.ts, which owns auth, the ok/fail
// envelope and the rate limiter and passes them in as `ctx` so this module never
// re-derives a tenant id or an error shape of its own.
//
// Two things every description here has to tell the agent, because getting
// either wrong produces confident nonsense:
//
//  1. EVERY SocQ call is asynchronous. A tool returns "queued", not data. The
//     results land later and are read back with get_social_context or
//     list_social_opportunities. An agent that treats the return value as the
//     answer will report an empty profile as a real one.
//
//  2. SocQ cannot identify anybody. It has no endpoint that takes an email, no
//     endpoint that takes a company domain for a social lookup, and no output
//     anywhere carrying a confidence, a match score or a verification flag. So
//     hydration only ever runs on a URL the record already carries and our
//     stack already verified, and a search result NEVER becomes a contact.
//
// Deliberately absent: any tool that creates a contact from a post author, and
// any tool that accepts a profile URL to hydrate. Both are the same-name-
// stranger bug wearing a different hat.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { OpError } from "@/lib/op-error";
import { getSocialContext } from "@/lib/social-hydrate";
import { enqueueSocialHydrate, requestSocialTranscript } from "@/lib/social-tasks";
import {
  CONVERSION_RULE,
  SEARCHABLE_PLATFORMS,
  SOCIAL_PLATFORMS,
  convertSocialOpportunity,
  createSocialMonitor,
  deleteSocialMonitor,
  listSocialMonitors,
  listSocialOpportunities,
} from "@/lib/social-opportunities";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** The helpers the MCP route owns and hands down. Kept structural so this
 *  module never imports the route (which would be a cycle). */
export interface SocialToolContext {
  /** Wrap a tool body, turning OpErrors into clean tool errors. */
  run: (fn: () => Promise<unknown>) => Promise<ToolResult>;
  /** Like run(), plus a per-user rate limit; passes the authenticated userId. */
  gated: (
    extra: { authInfo?: AuthInfo },
    bucket: string,
    limit: number,
    fn: (userId: string) => Promise<unknown>,
  ) => Promise<ToolResult>;
  /** Read the authenticated user id injected by withMcpAuth. */
  userIdFrom: (extra: { authInfo?: AuthInfo }) => string;
}

const ASYNC_NOTE =
  "ASYNC: this queues work with the provider and returns immediately. No data comes back from this call. Results arrive minutes later; read them with get_social_context.";

const HYDRATE_DESCRIPTION = `Fill in social profile and recent-post context for a contact or company you already have, so your next message can reference something real.

WHAT IT USES: only the social URLs ALREADY on the record and already verified by Scalar (a LinkedIn, X, Instagram or Facebook profile that a human entered, or that find_socials saved after matching BOTH the person's name and their company). You cannot pass a URL to this tool. There is no argument for one.

WHAT IT REFUSES, and why: a URL whose recorded provenance says it was inferred or guessed, and any URL that is not a canonical profile page (a post, a group, a search result). The provider behind this has no identity resolution at all: it returns no confidence, no match score, no candidate list and no verification flag, so if we hydrated a guessed URL there would be no signal that could tell us we had just attached a stranger's life to your contact. Scalar would rather leave the field empty. Refusals come back in refused[] with a reason.

If the record has no verified profile yet, run find_socials first, or have a human paste the URL onto the record. Never work around this by writing a guessed URL onto the contact and then calling this tool.

${ASYNC_NOTE}`;

const CONTEXT_DESCRIPTION = `Read back everything Scalar holds about a record's social presence: profiles (handle, display name, bio, follower count, location), recent posts with their text and publish dates, and any hydration still in flight. Read-only, free, no provider call.

Use this before drafting outreach. Quote only what is actually in posts[]: if a post is not listed, you have not seen it, and describing it would be an invention. Everything here was hydrated from a URL the record already carried and Scalar verified, so it is about this exact person or company, never a same-name match.`;

const MONITOR_DESCRIPTION = `Create a saved social watch. Anything it finds goes to a REVIEW QUEUE (list_social_opportunities), never into the CRM.

Two shapes:
- keyword watch: pass query plus one of these platforms: ${SEARCHABLE_PLATFORMS.join(", ")}.
- community watch: pass sourceUrls, the exact Facebook group / Reddit subreddit / X list URLs the operator already has.

WHAT IS NOT POSSIBLE, so do not offer it: LinkedIn cannot be searched at all (every LinkedIn endpoint requires exact URLs). Facebook has no keyword search and NO group discovery, so we cannot go and find groups about a topic; the operator must supply group URLs.

Watches run on a schedule and are billed per result, so results per run is capped low on purpose. ${ASYNC_NOTE}`;

const OPPORTUNITY_DESCRIPTION = `The review queue: posts a social watch found that might be buying signals. Each row carries the post text, the post URL, the platform, the raw author blob exactly as the provider sent it, and an intent score 0-100 with a one-line reason that Scalar computed from the POST TEXT ALONE (the provider returns no sentiment and no intent of any kind).

These are NOT contacts and NOT leads. They are posts. The author is a display name on a page, nothing more: we have no verified identity for them, so treat every author field as unconfirmed and never write it onto a record. Read-only and free.`;

const CONVERT_DESCRIPTION = `Attach a reviewed opportunity to a contact or company, marking it CONVERTED.

${CONVERSION_RULE}

So this tool REQUIRES an existing contactId or entityId that you have already verified is the right one, and it will 404 if that record does not exist. It does not create anything and there is no argument that would make it create anything. If the opportunity really is a new person, create the contact through create_contact, verify it the way any contact is verified, then convert against that id.`;

const TRANSCRIPT_DESCRIPTION = `Transcribe a social video: YouTube, TikTok, Instagram or Facebook video. Pass the video URL.

This is genuinely different from Scalar's other providers, which read pages and not speech, so use it when what you need was said out loud: a founder's talk, a product walkthrough, a podcast clip.

A transcript is content, attached to nobody: it makes no identity claim and is never written onto a contact. ${ASYNC_NOTE} The finished transcript is stored against the video URL and comes back through get_social_context for a record it was linked to, or can be read from the social posts store.`;

export function registerSocialTools(server: McpServer, ctx: SocialToolContext): void {
  /* ----------------------------- Hydration ---------------------------- */

  server.tool(
    "hydrate_social_profile",
    HYDRATE_DESCRIPTION,
    {
      contactId: z.string().optional().describe("The contact to hydrate (or set entityId)"),
      entityId: z.string().optional().describe("The company to hydrate (or set contactId)"),
      includePosts: z
        .boolean()
        .optional()
        .describe("Also pull recent posts for each verified profile (default true)"),
      platform: z
        .enum(SOCIAL_PLATFORMS)
        .optional()
        .describe("Limit to one platform's verified URL instead of all of them"),
      reason: z
        .string()
        .max(500)
        .describe("One line saying why this record needs social context now. The operator reads it word for word."),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ contactId, entityId, includePosts, platform, reason }, extra) =>
      ctx.gated(extra, "social_hydrate", 60, async (userId) => {
        if (!contactId && !entityId) throw new OpError("Set contactId or entityId", 400);
        if (contactId && entityId) throw new OpError("Set exactly one of contactId or entityId", 400);
        const { task, deduped } = await enqueueSocialHydrate(userId, {
          contactId: contactId ?? null,
          entityId: entityId ?? null,
          includePosts,
          platform,
          reason,
        });
        return {
          queued: true,
          deduped,
          taskId: task.id,
          note: deduped
            ? "Hydration for this record was already queued; the existing task was returned rather than paying to ask twice."
            : "Queued. Only URLs already on this record and already verified will be used; anything guessed is refused. Read the result back with get_social_context.",
        };
      }),
  );

  server.tool(
    "get_social_context",
    CONTEXT_DESCRIPTION,
    {
      contactId: z.string().optional().describe("The contact to read (or set entityId)"),
      entityId: z.string().optional().describe("The company to read (or set contactId)"),
      postLimit: z.number().int().min(1).max(200).optional().describe("Recent posts to return (default 20)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ contactId, entityId, postLimit }, extra) =>
      ctx.run(() =>
        getSocialContext(
          ctx.userIdFrom(extra),
          { contactId: contactId ?? null, entityId: entityId ?? null },
          { postLimit },
        ),
      ),
  );

  /* ------------------------------ Monitors ---------------------------- */

  server.tool(
    "create_social_monitor",
    MONITOR_DESCRIPTION,
    {
      name: z.string().max(200).describe("What this watch is for, in the operator's words"),
      platform: z.enum(SOCIAL_PLATFORMS).describe("Which platform to watch"),
      query: z
        .string()
        .max(500)
        .optional()
        .describe("Keyword query. Not available on LinkedIn or Facebook; use sourceUrls there."),
      sourceUrls: z
        .array(z.string().max(1000))
        .max(20)
        .optional()
        .describe("Exact community URLs the operator already has (Facebook groups, subreddits, X lists)"),
      resultsLimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Results per run. Billed per result, so keep it small (default 25, hard cap 50)."),
      publishedWithin: z
        .string()
        .max(50)
        .optional()
        .describe("Provider-side recency filter, e.g. \"7d\". Passed through unchanged."),
      frequency: z.enum(["hourly", "daily", "weekly"]).optional().describe("How often to run (default daily)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (args, extra) =>
      ctx.gated(extra, "social_monitor", 30, (userId) => createSocialMonitor(userId, args)),
  );

  server.tool(
    "list_social_monitors",
    "List this account's saved social watches: what each is watching, on which platform, how often it runs, when it last ran and whether it is active. Read-only and free.",
    { limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 50)") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ limit }, extra) => ctx.run(() => listSocialMonitors(ctx.userIdFrom(extra), { limit })),
  );

  server.tool(
    "delete_social_monitor",
    "Delete a saved social watch by id. Opportunities it already found stay in the review queue; only the schedule goes away.",
    { id: z.string().describe("Monitor id from list_social_monitors") },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ id }, extra) =>
      ctx.gated(extra, "social_monitor", 60, (userId) => deleteSocialMonitor(userId, id)),
  );

  /* ---------------------------- Opportunities ------------------------- */

  server.tool(
    "list_social_opportunities",
    OPPORTUNITY_DESCRIPTION,
    {
      status: z
        .enum(["NEW", "REVIEWED", "DISMISSED", "CONVERTED"])
        .optional()
        .describe("Which queue to read (default NEW)"),
      monitorId: z.string().optional().describe("Filter to one watch"),
      minIntentScore: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe("Only rows scoring at least this. Scores are Scalar's, computed from post text alone."),
      limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 50)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args, extra) => ctx.run(() => listSocialOpportunities(ctx.userIdFrom(extra), args)),
  );

  server.tool(
    "convert_opportunity",
    CONVERT_DESCRIPTION,
    {
      id: z.string().describe("Opportunity id from list_social_opportunities"),
      contactId: z
        .string()
        .optional()
        .describe("An EXISTING contact you have already verified is the author or subject of this post"),
      entityId: z.string().optional().describe("Or an EXISTING company"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ id, contactId, entityId }, extra) =>
      ctx.gated(extra, "social_convert", 60, (userId) =>
        convertSocialOpportunity(userId, id, {
          contactId: contactId ?? null,
          entityId: entityId ?? null,
        }),
      ),
  );

  /* ----------------------------- Transcripts -------------------------- */

  server.tool(
    "get_social_transcript",
    TRANSCRIPT_DESCRIPTION,
    {
      url: z.string().max(1000).describe("The video URL: YouTube, TikTok, Instagram or Facebook video"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ url }, extra) =>
      ctx.gated(extra, "social_transcript", 30, async (userId) => {
        const request = await requestSocialTranscript(userId, url);
        return {
          ...request,
          queued: true,
          note: "Queued. Transcription is asynchronous; the text lands against this video URL once the provider finishes. Do not report a transcript you have not read.",
        };
      }),
  );
}
