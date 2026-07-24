import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { authenticateApiKeyDetailed, bearerFromRequest } from "@/lib/api-auth";
import { userIdFromAccessToken } from "@/lib/oauth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  topUpHint,
  isX402Configured,
  buildRequirements,
  grantAfterSettle,
  paymentRequiredBody,
  paymentRef,
  verifyPayment,
  settlePayment,
  decodePaymentHeader,
  resourceUrl,
  x402Network,
  USD_PER_CREDIT,
} from "@/lib/x402";
import {
  OpError,
  listEntities,
  getEntity,
  createEntity,
  updateEntity,
  enrichEntity,
  deleteEntity,
  findCompanies,
  discoverLocalLeads,
  extractSiteContacts,
  searchGoogle,
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  saveEmail,
  listContactEmails,
  saveSocialMessage,
  listSocialMessages,
  searchCrm,
  logOutreach,
  addActivity,
  listActivities,
  listDueFollowups,
  placeContactCall,
  saveCall,
  listContactCalls,
  syncContactCall,
} from "@/lib/crm-operations";
import { tavilySearch, isTavilyConfigured } from "@/lib/tavily";
import { enrichContactField } from "@/lib/contact-enrich";
import { findContactSocials } from "@/lib/social-find";
import {
  normalizeSocialChannel,
  normalizeDirection,
  normalizeActivityKind,
  requireNormalized,
} from "@/lib/agent-enums";
import {
  spendCredits,
  ensureCredits,
  getBilling,
  addCredits,
  alreadyCredited,
  applyPlan,
  PLANS,
  PLAN_USD,
  CREDIT_COSTS,
  type PaidPlanName,
} from "@/lib/credits";
import { storeMemory, recallMemory } from "@/lib/memory";
import { getProvenanceMap } from "@/lib/provenance";
import { verifyEntity } from "@/lib/enrich/verified-entity";
import { detectEntityTech } from "@/lib/enrich/technographics";
import {
  listSegments,
  getSegment,
  createSegment,
  updateSegment,
  deleteSegment,
  removeSegmentMember,
  buildSmartSegment,
  listPipelines,
  getPipeline,
  createPipeline,
  addToPipeline,
  deletePipeline,
  removePipelineEntry,
  updatePipelineEntry,
  pipelineMetrics,
} from "@/lib/field-operations";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

// Read the authenticated user id injected by withMcpAuth.
function userIdFrom(extra: { authInfo?: AuthInfo }): string {
  const id = (extra.authInfo?.extra as { userId?: string } | undefined)?.userId;
  if (!id) throw new OpError("Unauthorized", 401);
  return id;
}

// The acting agent (API key) behind this session, for Activity attribution in
// team workspaces. Null on OAuth sessions (the human is the tenant there).
function actorFrom(extra: { authInfo?: AuthInfo }): { id: string; label: string } | null {
  const x = extra.authInfo?.extra as { actorId?: string; actorLabel?: string } | undefined;
  return x?.actorId ? { id: x.actorId, label: x.actorLabel ?? "agent key" } : null;
}

// Turn an OpError into a tool message, appending the x402 top-up pointer when
// the failure is "out of credits" (402) and agent payments are configured, so a
// connected agent can pay its own way and retry instead of stalling.
function opErrorMessage(e: OpError): string {
  if (e.status === 402) {
    // Structured, machine-actionable out-of-credits contract: an autonomous
    // agent parses this, calls buy_credits (USDC over x402, no human), then
    // retries the exact call that failed.
    if (isX402Configured()) {
      return JSON.stringify({
        error: "insufficient_credits",
        message: e.message,
        code: 402,
        remedy: {
          reason: "Buy more usage yourself with USDC over x402, no human needed.",
          tools: ["buy_credits", "buy_plan", "get_usage"],
          suggestedCall: { tool: "buy_credits", args: { credits: 1000 } },
          retryAfterPurchase: true,
        },
        paymentsConfigured: true,
      });
    }
    const hint = topUpHint();
    if (hint) return `${e.message} ${hint}`;
  }
  return e.message;
}

// Wrap a tool body so OpErrors become clean tool errors instead of 500s.
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof OpError) return fail(opErrorMessage(e));
    console.error("MCP tool error", e);
    return fail("Internal error");
  }
}

// Like run(), but adds a per-user rate limit for tools that hit paid providers
// or fan out writes - external agents hold long-lived keys, so an uncapped paid
// tool is unbounded spend. Durable when Upstash is configured. Passes the
// authenticated userId into the body.
async function gated(
  extra: { authInfo?: AuthInfo },
  bucket: string,
  limit: number,
  fn: (userId: string) => Promise<unknown>,
): Promise<ToolResult> {
  try {
    const userId = userIdFrom(extra);
    const rate = await checkRateLimit(`mcp:${bucket}:${userId}`, limit, 60_000);
    if (!rate.success) return fail("Rate limit reached for this tool. Please wait a moment and try again.");
    return ok(await fn(userId));
  } catch (e) {
    if (e instanceof OpError) return fail(opErrorMessage(e));
    console.error("MCP tool error", e);
    return fail("Internal error");
  }
}

// Two-step x402 over MCP. An MCP tool call can't carry the HTTP-402
// challenge/response, so a buy tool called WITHOUT xPayment returns a quote (the
// payment requirements an x402 client signs); called again WITH the signed
// base64 X-PAYMENT, it verifies, idempotency-checks the on-chain nonce, settles,
// and credits. Reuses the exact x402 + credits path the HTTP routes use, so a
// nonce settled through either transport is recognised as a duplicate.
async function buyCreditsViaMcp(
  userId: string,
  credits: number,
  xPayment?: string,
): Promise<unknown> {
  if (!isX402Configured()) throw new OpError("Agent payments are not configured yet.", 501);
  const priceUsd = Math.round(credits * USD_PER_CREDIT * 100) / 100;
  const requirements = buildRequirements({
    priceUsd,
    resource: resourceUrl("/api/x402/topup"),
    description: `Top up ${credits} Scalar credits`,
  });
  if (!xPayment) {
    return {
      step: "quote",
      credits,
      priceUsd,
      ...paymentRequiredBody(
        requirements,
        "Sign this with your x402 client and call buy_credits again with xPayment set.",
      ),
    };
  }
  const payload = decodePaymentHeader(xPayment);
  if (!payload) throw new OpError("xPayment is not a valid base64 X-PAYMENT payload.", 400);
  const verified = await verifyPayment(payload, requirements);
  if (!verified.ok) throw new OpError(`Payment invalid: ${verified.reason}`, 402);
  const ref = paymentRef(payload);
  if (!ref) throw new OpError("Payment payload missing nonce - cannot process idempotently.", 400);
  const prior = await alreadyCredited(userId, ref);
  if (prior !== null) return { step: "settled", credited: 0, balance: prior, duplicate: true };
  const settled = await settlePayment(payload, requirements);
  if (!settled.ok) throw new OpError(`Settlement failed: ${settled.reason}`, 402);
  const balance = await grantAfterSettle(
    () => addCredits(userId, credits, { action: "topup_x402", ref }),
    { transaction: settled.transaction, userId, ref, amount: String(credits) },
  );
  return { step: "settled", credited: credits, balance, network: x402Network(), transaction: settled.transaction };
}

async function buyPlanViaMcp(
  userId: string,
  plan: PaidPlanName,
  xPayment?: string,
): Promise<unknown> {
  if (!isX402Configured()) throw new OpError("Agent payments are not configured yet.", 501);
  const requirements = buildRequirements({
    priceUsd: PLAN_USD[plan],
    resource: resourceUrl("/api/x402/subscribe"),
    description: `Scalar ${plan} plan, 30 days`,
  });
  if (!xPayment) {
    return {
      step: "quote",
      plan,
      usd: PLAN_USD[plan],
      credits: PLANS[plan].credits,
      ...paymentRequiredBody(
        requirements,
        "Sign this with your x402 client and call buy_plan again with xPayment set.",
      ),
    };
  }
  const payload = decodePaymentHeader(xPayment);
  if (!payload) throw new OpError("xPayment is not a valid base64 X-PAYMENT payload.", 400);
  const verified = await verifyPayment(payload, requirements);
  if (!verified.ok) throw new OpError(`Payment invalid: ${verified.reason}`, 402);
  const ref = paymentRef(payload);
  if (!ref) throw new OpError("Payment payload missing nonce - cannot process idempotently.", 400);
  const seen = await alreadyCredited(userId, ref);
  if (seen !== null) return { step: "settled", plan, duplicate: true };
  const settled = await settlePayment(payload, requirements);
  if (!settled.ok) throw new OpError(`Settlement failed: ${settled.reason}`, 402);
  await grantAfterSettle(
    () => applyPlan(userId, plan, { ref }),
    { transaction: settled.transaction, userId, ref, amount: `plan:${plan}` },
  );
  return { step: "settled", plan, credits: PLANS[plan].credits, period: "30 days", network: x402Network(), transaction: settled.transaction };
}

const handler = createMcpHandler(
  (server) => {
    /* -------------------------- Entities -------------------------- */
    server.tool(
      "list_entities",
      "List businesses (entities) in the CRM, newest first. Accepted params: query (filters name/domain/industry; `search` is an alias, query wins if both are sent) and limit (rows to return, 1-200, default 50). No other params are read.",
      {
        query: z.string().max(500).optional(),
        search: z.string().max(500).optional().describe("Alias for query (older agent docs); ignored when query is set"),
        limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 50)"),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ query, search, limit }, extra) =>
        run(() => listEntities(userIdFrom(extra), query ?? search, limit)),
    );

    server.tool(
      "get_entity",
      "Get one business by id, including its contacts.",
      { id: z.string() },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ id }, extra) => run(() => getEntity(userIdFrom(extra), id)),
    );

    server.tool(
      "create_entity",
      "Create a business (entity) in the CRM.",
      {
        name: z.string().max(300),
        domain: z.string().max(255).optional(),
        website: z.string().max(500).optional(),
        phone: z.string().max(50).optional(),
        industry: z.string().max(200).optional(),
        location: z.string().max(300).optional(),
        description: z.string().max(10000).optional(),
        size: z.string().max(100).optional(),
        notes: z.string().max(10000).optional(),
        tags: z.array(z.string().max(50)).max(50).optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async (args, extra) =>
        gated(extra, "create", 120, (userId) =>
          createEntity(userId, { ...args, source: "agent" }),
        ),
    );

    server.tool(
      "update_entity",
      "Update fields on a business.",
      {
        id: z.string(),
        name: z.string().max(300).optional(),
        domain: z.string().max(255).nullable().optional(),
        website: z.string().max(500).nullable().optional(),
        phone: z.string().max(50).nullable().optional(),
        industry: z.string().max(200).nullable().optional(),
        location: z.string().max(300).nullable().optional(),
        description: z.string().max(10000).nullable().optional(),
        size: z.string().max(100).nullable().optional(),
        notes: z.string().max(10000).nullable().optional(),
        status: z.enum(["NEW", "ENRICHED", "ARCHIVED"]).optional(),
        tags: z.array(z.string().max(50)).max(50).optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ id, ...rest }, extra) =>
        gated(extra, "update_entity", 120, (userId) => updateEntity(userId, id, rest)),
    );

    server.tool(
      "enrich_entity",
      "Enrich a business via Explorium using its domain (pulls company data + firmographics). Stores the result on the entity.",
      { id: z.string() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ id }, extra) => gated(extra, "enrich", 20, (userId) => enrichEntity(userId, id)),
    );

    server.tool(
      "delete_entity",
      "Permanently delete a business (entity) from the CRM by id. Its contacts are kept (unlinked from the company). Use to clean up junk or duplicate records.",
      { id: z.string() },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      async ({ id }, extra) => gated(extra, "delete_entity", 60, (userId) => deleteEntity(userId, id)),
    );

    /* -------------------------- Contacts -------------------------- */
    server.tool(
      "list_contacts",
      "List people (contacts), newest first. Accepted params: query (filters name/email/company; `search` is an alias, query wins if both are sent), status (pipeline status filter), and limit (rows to return, 1-200, default 50). No other params are read.",
      {
        query: z.string().max(500).optional(),
        search: z.string().max(500).optional().describe("Alias for query (older agent docs); ignored when query is set"),
        status: z.string().max(20).optional(),
        limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 50)"),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ query, search, status, limit }, extra) =>
        run(() => listContacts(userIdFrom(extra), { q: query ?? search, status, limit })),
    );

    server.tool(
      "get_contact",
      "Get one contact by id, including linked entity and saved email context.",
      { id: z.string() },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ id }, extra) => run(() => getContact(userIdFrom(extra), id)),
    );

    server.tool(
      "create_contact",
      "Create a person (contact). Optionally assign to an entity by entityId. Set source to where you found the lead (e.g. 'linkedin', 'x', 'instagram', 'facebook', 'referral', 'event') so attribution stays honest; it defaults to 'agent'.",
      {
        name: z.string().max(200).optional(),
        email: z.string().max(320).optional(),
        phone: z.string().max(50).optional(),
        company: z.string().max(200).optional(),
        title: z.string().max(200).optional(),
        website: z.string().max(500).optional(),
        linkedin: z.string().max(500).optional(),
        facebook: z.string().max(500).optional(),
        instagram: z.string().max(500).optional(),
        twitter: z.string().max(500).optional().describe("X (twitter.com / x.com) profile URL or handle"),
        location: z.string().max(200).optional(),
        notes: z.string().max(10000).optional(),
        source: z.string().max(100).optional(),
        tags: z.array(z.string().max(50)).max(50).optional(),
        entityId: z.string().optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async (args, extra) =>
        gated(extra, "create", 120, (userId) =>
          createContact(userId, { ...args, source: args.source || "agent" }),
        ),
    );

    server.tool(
      "update_contact",
      "Update fields on a contact (including status, social profiles, and entity assignment).",
      {
        id: z.string(),
        name: z.string().max(200).nullable().optional(),
        email: z.string().max(320).nullable().optional(),
        phone: z.string().max(50).nullable().optional(),
        company: z.string().max(200).nullable().optional(),
        title: z.string().max(200).nullable().optional(),
        website: z.string().max(500).nullable().optional(),
        linkedin: z.string().max(500).nullable().optional(),
        facebook: z.string().max(500).nullable().optional(),
        instagram: z.string().max(500).nullable().optional(),
        twitter: z.string().max(500).nullable().optional().describe("X (twitter.com / x.com) profile URL or handle"),
        location: z.string().max(200).nullable().optional(),
        source: z.string().max(100).nullable().optional(),
        status: z
          .enum([
            "NEW",
            "ENRICHED",
            "CONTACTED",
            "REPLIED",
            "QUALIFIED",
            "WON",
            "LOST",
            "ARCHIVED",
          ])
          .optional(),
        notes: z.string().max(10000).nullable().optional(),
        tags: z.array(z.string().max(50)).max(50).optional(),
        entityId: z.string().nullable().optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ id, ...rest }, extra) =>
        gated(extra, "update_contact", 120, (userId) => updateContact(userId, id, rest)),
    );

    server.tool(
      "delete_contact",
      "Permanently delete a person (contact) from the CRM by id. Use to clean up junk or duplicate records.",
      { id: z.string() },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      async ({ id }, extra) => gated(extra, "delete_contact", 60, (userId) => deleteContact(userId, id)),
    );

    server.tool(
      "enrich_contact",
      "Find and save a contact's missing LinkedIn, work email, or phone. Verified against the contact's name AND company so a same-name stranger is never attached (accuracy over coverage); needs the contact linked to a company or to have a website/work email so the company domain is known. Pass the contact id and which field to enrich.",
      { id: z.string(), field: z.enum(["linkedin", "email", "phone"]) },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ id, field }, extra) =>
        gated(extra, "enrich", 20, (userId) => enrichContactField(userId, id, field)),
    );

    /* ------------------------ Email context ----------------------- */
    server.tool(
      "save_email_context",
      "Save an email exchanged with a contact onto their record as reusable context.",
      {
        contactId: z.string(),
        direction: z.enum(["INBOUND", "OUTBOUND"]),
        subject: z.string().max(500).optional(),
        body: z.string().max(100_000).optional(),
        fromAddr: z.string().max(320).optional(),
        toAddr: z.string().max(320).optional(),
        savedAsContext: z.boolean().optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async (args, extra) =>
        gated(extra, "save_email_context", 120, (userId) =>
          saveEmail(userId, {
            ...args,
            savedAsContext: args.savedAsContext ?? true,
          }),
        ),
    );

    server.tool(
      "list_emails",
      "Get the email history with a contact (subject, body, direction, from/to), newest first. Capped like other list tools (default 50, max 200) - ask for more with limit when you mean it.",
      {
        contactId: z.string().max(200),
        limit: z.number().int().min(1).max(200).optional(),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ contactId, limit }, extra) =>
        run(() => listContactEmails(userIdFrom(extra), contactId, limit)),
    );

    /* ---------------------- Social profiles + DMs ----------------- */
    server.tool(
      "find_socials",
      "Find a contact's social profiles (LinkedIn, X, Instagram, Facebook) on the web. AUTO-SAVES only profiles verified against the contact's name AND company - a same-name stranger is never attached. Unverified hits come back as candidates: review them and save with update_contact only if you can confirm the person. Costs 4 credits when anything is found (a dry search is free). Needs the contact's name; a company/entity makes verification much stronger.",
      { contactId: z.string() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ contactId }, extra) =>
        gated(extra, "enrich", 20, (userId) => findContactSocials(userId, contactId)),
    );

    server.tool(
      "log_social_message",
      "Record a social media message with a contact (a LinkedIn/X/Instagram/Facebook DM, comment, or connection note) so the conversation history stays on the CRM alongside email. Advances pipeline state honestly: an OUTBOUND message stamps the outreach time and moves NEW/ENRICHED to CONTACTED; an INBOUND message moves CONTACTED to REPLIED. Pass threadRef (a permalink or thread id) when you have one. channel accepts linkedin, x (or twitter), instagram, facebook, other - any casing. direction accepts inbound, outbound - any casing.",
      {
        contactId: z.string(),
        channel: z
          .string()
          .max(20)
          .describe("linkedin | x (or twitter) | instagram | facebook | other - case-insensitive"),
        direction: z.string().max(20).describe("inbound | outbound - case-insensitive"),
        body: z.string().min(1).max(10000),
        threadRef: z.string().max(500).optional(),
        sentAt: z.string().datetime().optional().describe("ISO timestamp of when the message was sent"),
        savedAsContext: z.boolean().optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async ({ contactId, channel, direction, body, threadRef, sentAt, savedAsContext }, extra) =>
        gated(extra, "log_social_message", 120, (userId) =>
          saveSocialMessage(userId, {
            contactId,
            channel: requireNormalized(
              channel,
              normalizeSocialChannel,
              "channel",
              "linkedin, x, instagram, facebook, other",
            ),
            direction: requireNormalized(direction, normalizeDirection, "direction", "inbound, outbound"),
            body,
            threadRef: threadRef ?? null,
            sentAt: sentAt ? new Date(sentAt) : null,
            savedAsContext: savedAsContext ?? true,
          }),
        ),
    );

    server.tool(
      "list_social_messages",
      "Get the social media conversation history with a contact (LinkedIn/X/Instagram/Facebook messages), newest first, optionally filtered to one channel. channel accepts linkedin, x (or twitter), instagram, facebook, other - any casing.",
      {
        contactId: z.string(),
        channel: z
          .string()
          .max(20)
          .optional()
          .describe("linkedin | x (or twitter) | instagram | facebook | other - case-insensitive"),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ contactId, channel }, extra) =>
        run(() =>
          listSocialMessages(
            userIdFrom(extra),
            contactId,
            channel
              ? requireNormalized(
                  channel,
                  normalizeSocialChannel,
                  "channel",
                  "linkedin, x, instagram, facebook, other",
                )
              : undefined,
          ),
        ),
    );

    /* -------------------------- Discovery ------------------------- */
    server.tool(
      "search_crm",
      "Search across both entities and contacts in the CRM.",
      { query: z.string() },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ query }, extra) =>
        run(() => searchCrm(userIdFrom(extra), query)),
    );

    server.tool(
      "search_web",
      "Search the web (Tavily) to discover businesses, e.g. 'nail salons in Miami'. Returns titles, URLs, and snippets to turn into entities.",
      {
        query: z.string(),
        maxResults: z.number().int().min(1).max(20).optional(),
      },
      // Not readOnly: it debits the credit meter on a hit.
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ query, maxResults }, extra) =>
        gated(extra, "search_web", 30, async (userId) => {
          if (!isTavilyConfigured())
            throw new OpError("Web search is not configured (TAVILY_API_KEY missing).", 501);
          await ensureCredits(userId, "web_search");
          const results = await tavilySearch(query, { maxResults });
          // Debit only after the search succeeded AND returned something - a
          // dry search is free, same policy as every other metered tool.
          // (enrich/find tools debit inside the shared ops layer - never
          // double-charge here.)
          if (results.length > 0) await spendCredits(userId, "web_search");
          return results;
        }),
    );

    server.tool(
      "find_companies",
      "Discover CRM-ready companies from a prompt (e.g. 'B2B fintech startups in NYC' or 'nail salons in Miami') via Exa deep research, deduped against the CRM by domain then name, and add the new ones as entities. This is the prospecting tool - prefer it over search_web for finding companies to add.",
      { query: z.string(), count: z.number().int().min(1).max(25).optional() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ query, count }, extra) =>
        gated(extra, "find_companies", 10, (userId) => findCompanies(userId, { query, count })),
    );

    server.tool(
      "maps_leads",
      "Discover local businesses on Google Maps (via Apify) and add the new ones to the CRM as entities, deduped by domain then name. The tool for local lead gen: query is what to find ('dentists'), location narrows it ('Austin, TX'). Captures name, website, phone, and address. Costs 15 credits per run that returns leads (a dry run is free).",
      {
        query: z.string(),
        location: z.string().optional(),
        count: z.number().int().min(1).max(20).optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ query, location, count }, extra) =>
        gated(extra, "maps_leads", 10, (userId) => discoverLocalLeads(userId, { query, location, count })),
    );

    server.tool(
      "extract_contact_details",
      "Extract a company site's public contact details (emails, phones, social links) via Apify, deduped and tied to the site host (a strong, accurate company link). Returns the data for you to review and save selectively with create_contact - it does NOT auto-create contacts, so it never makes junk records from unnamed emails. Costs 8 credits when details are found (nothing on a miss).",
      { url: z.string().max(500) },
      // Not readOnly: it debits the credit meter on a hit.
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ url }, extra) =>
        gated(extra, "contact_extract", 20, (userId) => extractSiteContacts(userId, url)),
    );

    server.tool(
      "google_search",
      "Run a Google web search via Apify and get organic results (title, URL, snippet) to turn into entities. For finding AND adding companies in one step, prefer find_companies or maps_leads. Costs 4 credits per search that returns results.",
      {
        query: z.string().max(500),
        limit: z.number().int().min(1).max(20).optional(),
      },
      // Not readOnly: it debits the credit meter on a hit.
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ query, limit }, extra) =>
        gated(extra, "serp_search", 30, (userId) => searchGoogle(userId, { query, limit })),
    );

    /* -------------------------- Segments -------------------------- */
    server.tool(
      "list_segments",
      "List customer segments with member counts.",
      {},
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (_args, extra) => run(() => listSegments(userIdFrom(extra))),
    );

    server.tool(
      "get_segment",
      "Get a segment and its member contacts.",
      { id: z.string() },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ id }, extra) => run(() => getSegment(userIdFrom(extra), id)),
    );

    server.tool(
      "create_segment",
      "Create a customer segment manually, optionally with member contact ids.",
      { name: z.string().max(200), goal: z.string().max(2000).optional(), contactIds: z.array(z.string()).max(1000).optional() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async (args, extra) => gated(extra, "create_segment", 60, (userId) => createSegment(userId, args)),
    );

    server.tool(
      "update_segment",
      "Update a segment's name and/or goal.",
      { id: z.string(), name: z.string().max(200).optional(), goal: z.string().max(2000).optional() },
      async ({ id, ...patch }, extra) => run(() => updateSegment(userIdFrom(extra), id, patch)),
    );

    server.tool(
      "delete_segment",
      "Permanently delete a segment by id, including its membership. The member contacts themselves are kept. Use to clean up junk or stale segments.",
      { id: z.string() },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      async ({ id }, extra) => run(() => deleteSegment(userIdFrom(extra), id)),
    );

    server.tool(
      "remove_segment_member",
      "Remove one contact from a segment without deleting the segment or the contact.",
      { segmentId: z.string(), contactId: z.string() },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      async ({ segmentId, contactId }, extra) => run(() => removeSegmentMember(userIdFrom(extra), segmentId, contactId)),
    );

    server.tool(
      "build_smart_segment",
      "Build a segment from a goal: vector-matches the closest ELIGIBLE prospects (enriched, not yet contacted, not already in a pipeline). Use this to auto-create a targeted segment. Costs 2 credits when prospects are matched (no eligible prospects, or nothing matched, costs nothing).",
      { goal: z.string(), quantity: z.number().int().min(1).max(100).optional(), name: z.string().optional() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async (args, extra) =>
        gated(extra, "build_segment", 10, (userId) => buildSmartSegment(userId, args)),
    );

    /* -------------------------- Pipelines ------------------------- */
    server.tool(
      "list_pipelines",
      "List pipelines with entry counts.",
      {},
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (_args, extra) => run(() => listPipelines(userIdFrom(extra))),
    );

    server.tool(
      "get_pipeline",
      "Get a pipeline with its entries (stage, deal score, conversation status) and contacts.",
      { id: z.string() },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ id }, extra) => run(() => getPipeline(userIdFrom(extra), id)),
    );

    server.tool(
      "create_pipeline",
      "Create a pipeline with an objective, optionally seeded from a segment (recommended).",
      { name: z.string(), goal: z.string().optional(), segmentId: z.string().optional() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async (args, extra) => gated(extra, "create_pipeline", 60, (userId) => createPipeline(userId, args)),
    );

    server.tool(
      "add_to_pipeline",
      "Add contacts (by ids and/or a whole segment) to a pipeline as new entries.",
      { pipelineId: z.string(), contactIds: z.array(z.string()).max(1000).optional(), segmentId: z.string().optional() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ pipelineId, ...rest }, extra) =>
        gated(extra, "add_to_pipeline", 60, (userId) => addToPipeline(userId, pipelineId, rest)),
    );

    server.tool(
      "delete_pipeline",
      "Permanently delete a pipeline by id, including its entries. The member contacts themselves are kept. Use to clean up junk or stale pipelines.",
      { id: z.string() },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      async ({ id }, extra) => run(() => deletePipeline(userIdFrom(extra), id)),
    );

    server.tool(
      "remove_pipeline_entry",
      "Remove one entry from a pipeline (drop that contact out of the deal flow) without deleting the pipeline or the contact.",
      { pipelineId: z.string(), entryId: z.string() },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      async ({ pipelineId, entryId }, extra) => run(() => removePipelineEntry(userIdFrom(extra), pipelineId, entryId)),
    );

    server.tool(
      "update_pipeline_entry",
      "Update a pipeline entry: move its stage, set a 0-100 deal score, or set conversation status. Set conversationStatus to CLOSED when a conversation is over so the agent stops following up.",
      {
        pipelineId: z.string(),
        entryId: z.string(),
        stage: z.enum(["NEW", "ENRICHED", "PROSPECTING", "ENGAGING", "REPLYING", "WON", "LOST"]).optional(),
        dealScore: z.number().int().min(0).max(100).nullable().optional(),
        conversationStatus: z.enum(["OPEN", "AWAITING_REPLY", "STALLED", "CLOSED"]).optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ pipelineId, entryId, ...patch }, extra) =>
        gated(extra, "update_pipeline_entry", 120, (userId) => updatePipelineEntry(userId, pipelineId, entryId, patch)),
    );

    server.tool(
      "pipeline_metrics",
      "Progress metrics for a pipeline: counts by stage and conversation status, won/lost, average deal score, and open conversations.",
      { pipelineId: z.string() },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ pipelineId }, extra) => run(() => pipelineMetrics(userIdFrom(extra), pipelineId)),
    );

    /* --------------------------- Memory --------------------------- */
    server.tool(
      "recall",
      "Recall relevant past context (earlier work and CRM notes) by similarity. Each MCP session is stateless, so call this before assuming you do not know something. Free (reads only your own stored memory); rate-limited per minute.",
      { query: z.string(), k: z.number().int().min(1).max(20).optional() },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ query, k }, extra) =>
        gated(extra, "recall", 60, (userId) => recallMemory(userId, query, k)),
    );
    server.tool(
      "remember",
      "Persist a durable note or fact to long-term memory so a future session can recall it. Use for decisions, preferences, and outreach context worth keeping. Costs 1 credit per memory actually saved (nothing charged on a failed save).",
      { content: z.string().max(8000), refId: z.string().optional() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async ({ content, refId }, extra) =>
        gated(extra, "remember", 30, async (userId) => {
          const remembered = await storeMemory(userId, "message", content, refId, { chargeCredits: true });
          // Report honestly: a silent no-op (embeddings unconfigured, insert
          // failure) must not hand an autonomous agent a success receipt.
          return remembered
            ? { remembered: true }
            : { remembered: false, reason: "Memory is unavailable right now (embeddings not configured or storage failed). Keep critical context in the CRM record instead." };
        }),
    );

    /* --------------------------- Billing -------------------------- */
    server.tool(
      "get_balance",
      "Your current Scalar usage balance: credits remaining, plan, and when the meter next resets. Free and read-only. Call it at the start of a session and after an insufficient_credits error.",
      {},
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (_args, extra) =>
        run(async () => {
          const b = await getBilling(userIdFrom(extra));
          return { ...b, usdPerCredit: USD_PER_CREDIT, paymentsConfigured: isX402Configured() };
        }),
    );
    server.tool(
      "get_usage",
      "The Scalar price list: how many credits each metered action costs, the plans you can buy, top-up limits, and your current balance. Free and read-only. Use it to plan spend and pick what to buy when low.",
      {},
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (_args, extra) =>
        run(async () => {
          const b = await getBilling(userIdFrom(extra));
          return {
            creditsRemaining: b.creditsRemaining,
            plan: b.plan,
            usdPerCredit: USD_PER_CREDIT,
            actionCosts: CREDIT_COSTS,
            plans: (Object.keys(PLAN_USD) as PaidPlanName[]).map((plan) => ({
              plan,
              usd: PLAN_USD[plan],
              credits: PLANS[plan].credits,
              period: "30 days",
            })),
            topUp: { minCredits: 100, maxCredits: 100000 },
            paymentsConfigured: isX402Configured(),
          };
        }),
    );
    server.tool(
      "buy_credits",
      "Buy more Scalar usage credits with USDC over x402 (pay as you go, $0.01 per credit). TWO STEPS: (1) call with { credits } and NO xPayment to get a quote (the payment requirements); (2) have your x402 client sign a USDC payment for those requirements and call again with the same { credits } plus xPayment set to the base64 X-PAYMENT header. Returns the new balance. Call this when a tool returns insufficient_credits, then retry the failed call. Safe to retry: a settled payment is never charged twice (idempotent on the on-chain nonce).",
      { credits: z.number().int().min(100).max(100000).default(1000), xPayment: z.string().optional() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      async ({ credits, xPayment }, extra) =>
        gated(extra, "x402_buy", 30, (userId) => buyCreditsViaMcp(userId, credits, xPayment)),
    );
    server.tool(
      "buy_plan",
      "Buy a Scalar plan for 30 days with USDC over x402 (starter, pro, or business; cheaper per credit than top-ups for sustained work). TWO STEPS: (1) call with { plan } and NO xPayment for a quote; (2) sign the USDC payment with your x402 client and call again with the same { plan } plus xPayment (base64 X-PAYMENT). Activates the plan and refills credits to its allotment. Idempotent on the on-chain nonce; not recurring (re-buy after 30 days).",
      { plan: z.enum(["starter", "pro", "business", "team"]), xPayment: z.string().optional() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      async ({ plan, xPayment }, extra) =>
        gated(extra, "x402_buy", 20, (userId) => buyPlanViaMcp(userId, plan, xPayment)),
    );

    server.tool(
      "verify_entity",
      "Verify and enrich a company against authoritative public registries: GLEIF (global LEI), UK Companies House, and SEC EDGAR (US public companies). Adds legal name, LEI, jurisdiction, registration status, officers, and firmographics, with provenance. Free (open/public data, no credits). Matches strictly by legal name, never a same-name stranger; returns 'no record found' rather than guessing.",
      { id: z.string() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      async ({ id }, extra) => gated(extra, "verify_entity", 20, (userId) => verifyEntity(userId, id)),
    );
    server.tool(
      "detect_tech",
      "Detect the technologies a company's website uses (ecommerce platform, CMS, analytics, marketing/CRM/support tools, payments, frameworks, hosting) by fingerprinting its homepage. Free (derived from the public page, no third-party data). Great for technographic targeting. The entity needs a website or domain.",
      { id: z.string() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      async ({ id }, extra) => gated(extra, "detect_tech", 20, (userId) => detectEntityTech(userId, id)),
    );

    /* ------------------------- Phone calls ------------------------ */
    server.tool(
      "place_call",
      "Call a contact via the user's connected AgentPhone account: the AI phone agent dials the number and follows your systemPrompt (what to say / the goal). Logs the call on the contact and marks them CONTACTED. Uses the contact's phone unless you pass toNumber (E.164, e.g. +14155551234). Requires AgentPhone connected in Settings.",
      {
        contactId: z.string(),
        systemPrompt: z.string().min(1).max(8000),
        toNumber: z.string().max(40).optional(),
        agentId: z.string().max(200).optional(),
        fromNumberId: z.string().max(200).optional(),
        initialGreeting: z.string().max(2000).optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async (a, extra) => gated(extra, "place_call", 20, (userId) => placeContactCall(userId, a)),
    );
    server.tool(
      "list_contact_calls",
      "Get the phone-call history with a contact (direction, numbers, status, duration, transcript, recording), newest first.",
      { contactId: z.string() },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ contactId }, extra) => run(() => listContactCalls(userIdFrom(extra), contactId)),
    );
    server.tool(
      "sync_call",
      "Refresh a logged call from AgentPhone: pull the latest status, duration, transcript, and recording onto the call record. Use after a call ends.",
      { logId: z.string() },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      async ({ logId }, extra) => gated(extra, "sync_call", 30, (userId) => syncContactCall(userId, logId)),
    );
    server.tool(
      "log_call",
      "Record a phone call on a contact that happened outside Scalar (for context). Does not place a call.",
      {
        contactId: z.string(),
        direction: z.enum(["INBOUND", "OUTBOUND"]),
        toNumber: z.string().max(40).optional(),
        fromNumber: z.string().max(40).optional(),
        summary: z.string().max(10000).optional(),
        transcript: z.string().max(100000).optional(),
        status: z.string().max(40).optional(),
        durationSec: z.number().int().min(0).optional(),
        // https only: this is rendered as a link in the UI, so a javascript:
        // or data: URL from a prompt-injected agent must never be storable.
        recordingUrl: z.string().url().max(1000).startsWith("https://").optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async (a, extra) => gated(extra, "log_call", 120, (userId) => saveCall(userId, a)),
    );

    /* ----------------------- Outreach tracking -------------------- */
    server.tool(
      "log_outreach",
      "Record that you reached out to a contact: stamps when, advances status (defaults to CONTACTED), and logs what you said as an activity. Call this after every outbound message so follow-ups stay reliable.",
      {
        contactId: z.string(),
        summary: z.string().max(5000),
        channel: z.enum(["email", "linkedin", "phone", "x", "instagram", "facebook", "other"]).optional(),
        status: z
          .enum(["NEW", "ENRICHED", "CONTACTED", "REPLIED", "QUALIFIED", "WON", "LOST", "ARCHIVED"])
          .optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async (a, extra) =>
        gated(extra, "log_outreach", 120, (userId) =>
          logOutreach(userId, { ...a, actor: actorFrom(extra) }),
        ),
    );
    server.tool(
      "list_due_followups",
      "List contacts that need a follow-up: in a given status (default CONTACTED) and not contacted in the last N days (default 7), oldest first. This is how you find who to chase next.",
      {
        status: z
          .enum(["NEW", "ENRICHED", "CONTACTED", "REPLIED", "QUALIFIED", "WON", "LOST", "ARCHIVED"])
          .optional(),
        staleDays: z.number().int().min(0).max(365).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (a, extra) => run(() => listDueFollowups(userIdFrom(extra), a)),
    );
    server.tool(
      "add_activity",
      "Log a timestamped note, call, or reply on a contact or company without overwriting its notes field. kind accepts note, call, outreach, reply, status_change - any casing.",
      {
        contactId: z.string().optional(),
        entityId: z.string().optional(),
        kind: z
          .string()
          .max(20)
          .describe("note | call | outreach | reply | status_change - case-insensitive"),
        body: z.string().max(10000),
        channel: z.string().max(40).optional(),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async (a, extra) =>
        gated(extra, "add_activity", 120, (userId) =>
          addActivity(userId, {
            ...a,
            kind: requireNormalized(
              a.kind,
              normalizeActivityKind,
              "kind",
              "note, call, outreach, reply, status_change",
            ),
            actor: actorFrom(extra),
          }),
        ),
    );
    server.tool(
      "list_activities",
      "Get the activity trail (outreach, notes, calls, replies) for a contact or company, newest first.",
      {
        contactId: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (a, extra) => run(() => listActivities(userIdFrom(extra), a)),
    );
    server.tool(
      "get_provenance",
      "Get field-level provenance for a contact or entity: which provider supplied each enriched field, its confidence, when it was retrieved, and whether it is stale. This is the audit trail behind \"via explorium, 3 days ago\" in the UI - use it to decide whether a field is trustworthy enough to act on or due for a re-verify. Returns an object keyed by field name; a record with no enrichment history returns an empty object.",
      {
        recordType: z.enum(["contact", "entity"]),
        recordId: z.string().max(200),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async ({ recordType, recordId }, extra) =>
        run(() => getProvenanceMap(recordType, recordId, userIdFrom(extra))),
    );
  },
  {
    serverInfo: { name: "scalar", version: "0.1.0" },
    instructions: `Scalar is a CRM that you, an AI agent, operate end to end with no human. You discover leads, enrich them accurately, organize them, track outreach, and you pay for your own usage when credits run low. Reads and writes to the CRM are free; credits are spent only when an action calls a paid outside provider - discovery, enrichment, web search, build_smart_segment's matching, and remember's memory writes all call one. recall is free: it only searches your own already-stored memory.

THE OPERATING LOOP
1. Orient. Call get_balance to know your runway, and recall to retrieve relevant past context (this session is stateless, and recall is free). Call search_crm or list_entities / list_contacts before discovering, so you build on existing records instead of duplicating them.
2. Discover. Add companies with find_companies (research-grade prospecting from a prompt) or maps_leads (local businesses by query plus location). Both dedupe against the CRM and add only new entities. Use google_search or search_web only to read raw web results, never to populate the CRM, and never present a search result as a company.
3. Enrich. For a promising entity with a domain, call enrich_entity (firmographics; idempotent, so re-enriching is free). For a contact missing linkedin / email / phone, call enrich_contact. For their social profiles (LinkedIn, X, Instagram, Facebook), call find_socials: it auto-saves only name+company-verified profiles and returns the rest as candidates for you to review. Enrich what you will act on, not the whole database; every enrichment costs credits.
4. Organize. Group not-yet-contacted prospects with build_smart_segment (costs credits when it matches prospects), then create_pipeline to track them through stages. Clean up as you go: update_segment/delete_segment/remove_segment_member and delete_pipeline/remove_pipeline_entry let you rename, retire, or prune segments and pipelines instead of leaving stale ones behind.
5. Track outreach. This is the memory that makes you reliable. When you email a contact, call save_email_context, then log_outreach to stamp when you reached out and advance status; use list_emails to reread the email history before you write the next one. When you message a lead on LinkedIn, X, Instagram, or Facebook, call log_social_message (it advances pipeline state itself; use list_social_messages to reread a conversation). When you source a lead FROM a social platform, set source on create_contact so attribution stays honest. Use list_due_followups to find who to chase next (contacts not touched in N days). Move pipeline entries with update_pipeline_entry, and set conversationStatus to CLOSED when a thread is done so you stop following up. Before acting on an enriched field you're unsure about, call get_provenance to see its source, confidence, and staleness. remember any decision or context worth keeping (costs 1 credit per memory actually saved).
6. Measure and repeat. Use pipeline_metrics to see what is working, then loop back to discovery.

ACCURACY IS NON-NEGOTIABLE. Never attach data to the wrong person or company. Enrichment is verified against the contact's name AND their company/domain, so a same-name stranger is never saved; prefer a null over a wrong value. extract_contact_details returns raw site contacts for you to review; save only the ones you can attribute to a real person.

WHEN YOU RUN OUT OF CREDITS, PAY AND RETRY. Metered tools return a JSON error with "error":"insufficient_credits" carrying a remedy. Do not stall or ask the human. Instead: (1) call buy_credits with no xPayment to get a quote, (2) sign the USDC payment with your x402 client and call buy_credits again with xPayment set, (3) retry the exact call that failed. Top-ups are idempotent, so a retried payment never double-charges. For sustained work, buy_plan is cheaper per credit. Only escalate to the human if buy_credits reports that agent payments are not configured.

Be economical: every external call spends real money. Orient before you discover, dedupe by reading first, enrich only what you will act on, and always advance the record's state so your next session resumes cleanly.`,
  },
  { basePath: "/api/mcp" },
);

// Per-user API key auth: resolve the bearer token to a Scalar user and inject
// the userId into authInfo.extra for the tools to scope on.
const authHandler = withMcpAuth(
  handler,
  async (req, bearerToken): Promise<AuthInfo | undefined> => {
    const token = bearerToken ?? bearerFromRequest(req);
    if (!token) return undefined;

    // Per-user API key (scl_...) first. The key id/name ride along so team
    // workspaces can attribute which agent did what (Activity.actorId/Label).
    const detailed = await authenticateApiKeyDetailed(token);
    if (detailed) {
      return {
        token,
        clientId: detailed.user.id,
        scopes: [],
        extra: {
          userId: detailed.user.id,
          actorId: detailed.keyId,
          actorLabel: detailed.keyName,
        },
      };
    }

    // OAuth access token (issued by our authorization server).
    const userId = await userIdFromAccessToken(token);
    if (userId) {
      return { token, clientId: userId, scopes: [], extra: { userId } };
    }

    return undefined;
  },
  {
    required: true,
    // 401s point clients at our protected-resource metadata, kicking off OAuth.
    resourceMetadataPath: "/.well-known/oauth-protected-resource",
  },
);

// Connector probes send HEAD before opening a session. Without an explicit
// handler Next falls through to the GET (an SSE stream that never ends for a
// bodyless probe) and the probe hangs until the platform 504s. Answer fast.
export function HEAD() {
  return new Response(null, { status: 204 });
}

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
