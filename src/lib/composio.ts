// The Composio client: one singleton, pinned toolkit versions, env-gated.
//
// Composio is how Scalar reaches the operator's OWN Gmail and Google Calendar.
// It is deliberately the only file that constructs a Composio client, because
// three things must be true on every call and are easy to get wrong once they
// are spread out:
//
//   1. Toolkit versions are PINNED at construction. Without a pin,
//      `tools.execute` throws ComposioToolVersionRequiredError, and worse,
//      trigger payload shapes can drift under a running deployment.
//   2. The webhook secret is asserted before it is ever passed to
//      `triggers.parse`: an empty-but-present verifySecret THROWS inside the
//      SDK, so "unset env var" must fail loudly at the edge, not silently
//      degrade into an unverified webhook.
//   3. Every outbound call goes through one throttle, because Composio's rate
//      limit is per ORGANISATION and is shared across every one of our
//      tenants. One tenant's burst is every tenant's outage.
//
// The three identifiers, since older tutorials get this wrong: there is no
// `entityId` any more. We have (a) our own userId string, opaque to Composio
// and needing no registration call, (b) an auth config id `ac_*`, created once
// per toolkit and reused for every user, held in env, and (c) a connected
// account id `ca_*`, one per user per toolkit. Gmail and Google Calendar are
// SEPARATE toolkits with separate auth configs and separate consent screens.
//
// SECURITY NOTE, LOAD-BEARING (see the scope block below): the granted Gmail
// authority now includes DELETE. Nothing in this codebase may ever call a
// Gmail delete, trash, or modify action. Every tool execution goes through
// `executeAllowedTool`, which enforces an explicit read-only allowlist of tool
// slugs, so the granted authority cannot be exercised by accident or by a
// prompt-injected agent that reaches our server. Do not add a bypass.

import { Composio } from "@composio/core";
import { OpError } from "@/lib/op-error";

/* ------------------------------- Scopes ------------------------------- */

// SCOPES ARE A PRODUCT DECISION, NOT A CONFIG DETAIL. Read before changing.
//
// This is Composio's MANAGED DEFAULT scope set, deliberately. The narrower
// alternative (gmail.readonly + gmail.send + calendar.readonly) was put to the
// founder with the tradeoff spelled out, and the default set was chosen. These
// constants are the single point of control and the record of that decision;
// they are persisted onto ConnectedAccount.scopes at connect time so a later
// change is detectable per row. We do NOT pass a narrowed `scopes` string when
// creating an auth config: the auth config (held in env as `ac_*`) governs the
// real grant, and it uses Composio's managed default.
//
// What that choice costs, plainly:
//
//   1. `https://mail.google.com/` is a Google RESTRICTED scope. App
//      verification requires a CASA (Cloud Application Security Assessment)
//      third-party review plus an annual re-audit. Budget MONTHS, not days,
//      before a public launch, and expect the unverified-app warning on the
//      consent screen until it clears.
//
//   2. It grants full read, write, DELETE and send over the operator's ENTIRE
//      mailbox. Our code only reads (and, later, sends). The granted authority
//      is therefore far wider than the code exercises, which is exactly the
//      thing that matters for blast radius: if COMPOSIO_API_KEY leaks, or a
//      single connected account is compromised, the attacker's ceiling is
//      "delete this person's mail", not "read this person's mail". The
//      allowlist in `executeAllowedTool` is the compensating control, and it
//      is the only one we have.
//
//   3. The consent screen additionally asks for contacts, profile, birthday
//      and phone-number access that we do not use at all. Operators will read
//      that list before they click Allow, and some will not click Allow.
//
//   4. CHANGING THIS LIST FORCES EVERY EXISTING USER TO RE-CONSENT. A Google
//      OAuth grant is pinned to the scope set it was issued for; narrowing it
//      later means an expired-connection state for every connected account and
//      a re-auth prompt in Settings for all of them. Treat it as a migration,
//      not an edit.
export const GMAIL_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  "https://www.googleapis.com/auth/user.birthday.read",
  "https://www.googleapis.com/auth/user.phonenumbers.read",
];

// Google Calendar's managed default, same decision, same reasoning. Broader
// than the calendar.readonly we exercise: it carries write authority over the
// operator's calendars that no code path here uses.
export const GCAL_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

/** The scope set granted for a provider. Recorded on ConnectedAccount at
 *  connect time; the auth config is what actually requests it. */
export function scopesForProvider(provider: ComposioProvider): readonly string[] {
  return provider === "GMAIL" ? GMAIL_SCOPES : GCAL_SCOPES;
}

/* ------------------------------ Toolkits ------------------------------ */

export type ComposioProvider = "GMAIL" | "GOOGLE_CALENDAR";

export const TOOLKIT_SLUG: Record<ComposioProvider, string> = {
  GMAIL: "gmail",
  GOOGLE_CALENDAR: "googlecalendar",
};

/** Pinned toolkit versions. Unpinned resolves to "latest", which makes
 *  `tools.execute` throw and lets trigger payload shapes change without a
 *  deploy. Bump deliberately, with a re-read of the trigger payload shape. */
export const TOOLKIT_VERSIONS: Record<string, string> = {
  gmail: "20260721_00",
  googlecalendar: "20260721_00",
};

/** Map a Composio toolkit slug (as it arrives on a webhook) back to our
 *  provider enum. Returns null for toolkits we do not sync. */
export function providerForToolkit(slug: string | null | undefined): ComposioProvider | null {
  const s = (slug ?? "").toLowerCase();
  if (s === "gmail") return "GMAIL";
  if (s === "googlecalendar" || s === "google_calendar" || s === "googlecalender") return "GOOGLE_CALENDAR";
  return null;
}

/* ------------------------------ Triggers ------------------------------ */

// There is NO Gmail thread-reply trigger. Gmail has exactly two, both POLLING,
// so replies are grouped by us on `data.thread_id`, which the payload carries.
export const GMAIL_NEW_MESSAGE_TRIGGER = "GMAIL_NEW_GMAIL_MESSAGE";
export const GMAIL_SENT_TRIGGER = "GMAIL_EMAIL_SENT_TRIGGER";

// The only true-push Calendar trigger is marked "SOON TO BE DEPRECATED" and
// carries no event content, so it is useless to us. The sync trigger polls but
// returns full event data including attendees, which is what we actually need.
export const GCAL_EVENT_SYNC_TRIGGER = "GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_SYNC_TRIGGER";

/** Composio-managed auth rejects any interval below 15 minutes as an API
 *  error. The trigger schema's `default: 1` is stale; only a custom Google
 *  OAuth app can poll faster. Always send this explicitly. */
export const MIN_POLL_INTERVAL_MINUTES = 15;

/** The triggers we register per provider, in the order we register them. */
export const TRIGGERS_FOR_PROVIDER: Record<ComposioProvider, readonly string[]> = {
  GMAIL: [GMAIL_NEW_MESSAGE_TRIGGER, GMAIL_SENT_TRIGGER],
  GOOGLE_CALENDAR: [GCAL_EVENT_SYNC_TRIGGER],
};

/** Which provider a trigger slug belongs to. Used by the webhook to route an
 *  event to the right ingest task without trusting the toolkit slug alone. */
export function providerForTriggerSlug(slug: string | null | undefined): ComposioProvider | null {
  const s = (slug ?? "").toUpperCase();
  if (s.startsWith("GMAIL_")) return "GMAIL";
  if (s.startsWith("GOOGLECALENDAR_")) return "GOOGLE_CALENDAR";
  return null;
}

/* -------------------------------- Env -------------------------------- */

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export function composioApiKey(): string | null {
  return env("COMPOSIO_API_KEY");
}

/** The auth config `ac_*` for a toolkit. One per toolkit for the whole
 *  project, reused by every tenant. */
export function authConfigIdFor(provider: ComposioProvider): string | null {
  return provider === "GMAIL"
    ? env("COMPOSIO_GMAIL_AUTH_CONFIG_ID")
    : env("COMPOSIO_GCAL_AUTH_CONFIG_ID");
}

/**
 * The webhook signing secret. Throws rather than returning empty, because
 * passing an empty string as `verifySecret` to `triggers.parse` throws inside
 * the SDK with a confusing message, and returning undefined would silently
 * parse an UNVERIFIED webhook. A missing secret is a deployment fault and must
 * read as one.
 */
export function composioWebhookSecret(): string {
  const secret = env("COMPOSIO_WEBHOOK_SECRET");
  if (!secret) {
    throw new OpError("COMPOSIO_WEBHOOK_SECRET is not set; refusing to accept unverified webhooks.", 500);
  }
  return secret;
}

/** True when at least one provider can be connected end to end: an API key,
 *  that provider's auth config, and a webhook secret to verify deliveries. */
export function isComposioConfigured(provider?: ComposioProvider): boolean {
  if (!composioApiKey() || !env("COMPOSIO_WEBHOOK_SECRET")) return false;
  if (provider) return Boolean(authConfigIdFor(provider));
  return Boolean(authConfigIdFor("GMAIL") || authConfigIdFor("GOOGLE_CALENDAR"));
}

/** Which providers are fully configured, for the settings surface. */
export function configuredProviders(): ComposioProvider[] {
  const all: ComposioProvider[] = ["GMAIL", "GOOGLE_CALENDAR"];
  return all.filter((p) => isComposioConfigured(p));
}

/* ------------------------------ Singleton ----------------------------- */

let client: Composio | null = null;

/**
 * The shared Composio client. Constructed lazily so importing this module in a
 * deployment without Composio configured (or in a unit test) never throws.
 */
export function getComposio(): Composio {
  const apiKey = composioApiKey();
  if (!apiKey) throw new OpError("Composio is not configured on this deployment.", 501);
  if (!client) {
    client = new Composio({ apiKey, toolkitVersions: TOOLKIT_VERSIONS });
  }
  return client;
}

/** Test seam: drop the memoised client so a changed env is picked up. */
export function resetComposioClient(): void {
  client = null;
}

/* --------------------------- Tool allowlist --------------------------- */

// THE COMPENSATING CONTROL FOR THE WIDE SCOPES. Read the scope block at the
// top of this file first.
//
// The Google grant includes `https://mail.google.com/`, which carries delete
// and modify authority over the operator's entire mailbox. Our code needs to
// read threads and list events, and nothing else. Rather than trust every
// future call site to remember that, the authority is fenced here: only the
// slugs on this list can ever be executed, and every execution in the codebase
// goes through `executeAllowedTool`.
//
// This matters more than it looks. An agent connected over MCP is, by
// construction, driven by text we did not write. If a prompt-injected agent
// ever reaches a code path that forwards a tool slug, the allowlist is what
// stands between "read my email" and "empty my inbox". Adding a slug here is a
// security decision, not a feature toggle. Nothing that deletes, trashes,
// modifies labels, or moves mail may be added, ever.
export const ALLOWED_TOOL_SLUGS: readonly string[] = [
  // Gmail, read-only.
  "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
  "GMAIL_FETCH_EMAILS",
  "GMAIL_LIST_HISTORY",
  "GMAIL_GET_PROFILE",
  // Google Calendar, read-only.
  "GOOGLECALENDAR_EVENTS_LIST",
  "GOOGLECALENDAR_FIND_EVENT",
];

// Belt and braces: even a slug added to the list by mistake is refused if it
// names a mutating verb. Cheap, and it makes the intent unmissable in review.
const MUTATING_SLUG_RE =
  /(DELETE|TRASH|REMOVE|MODIFY|UPDATE|PATCH|MOVE|LABEL|ARCHIVE|SEND|DRAFT|CREATE|INSERT|REPLY|FORWARD)/;

export function isToolAllowed(slug: string): boolean {
  const upper = (slug ?? "").toUpperCase();
  return ALLOWED_TOOL_SLUGS.includes(upper) && !MUTATING_SLUG_RE.test(upper);
}

/** Throw unless the slug is on the read-only allowlist. */
export function assertToolAllowed(slug: string): void {
  if (!isToolAllowed(slug)) {
    throw new OpError(
      `Composio tool "${slug}" is not on the read-only allowlist and will not be executed.`,
      403,
    );
  }
}

export interface AllowedToolExecuteBody {
  userId: string;
  connectedAccountId: string;
  arguments?: Record<string, unknown>;
}

/**
 * The ONLY way this codebase executes a Composio tool. Enforces the allowlist,
 * then runs the call through the shared pacer.
 */
export async function executeAllowedTool(
  slug: string,
  body: AllowedToolExecuteBody,
): Promise<{ successful?: boolean; error?: string | null; data?: Record<string, unknown> }> {
  assertToolAllowed(slug);
  return composioCall(() => getComposio().tools.execute(slug, body)) as Promise<{
    successful?: boolean;
    error?: string | null;
    data?: Record<string, unknown>;
  }>;
}

/**
 * Read a tool's real input schema at runtime. Per-tool ARGUMENT NAMES could
 * not be verified offline, so callers match parameters by shape against this
 * rather than hardcoding a guess. Allowlisted the same way as execution.
 */
export async function getAllowedToolSchema(slug: string): Promise<Record<string, unknown>> {
  assertToolAllowed(slug);
  const tools = (await composioCall(() =>
    getComposio().tools.getRawComposioTools({ tools: [slug] }),
  )) as Array<{ inputParameters?: { properties?: Record<string, unknown> } }>;
  return tools?.[0]?.inputParameters?.properties ?? {};
}

/* ------------------------------ Throttle ------------------------------ */

// Composio's rate limit is per ORGANISATION (2k/min starter, 10k/min growth,
// one-minute window) and is SHARED across every endpoint and every tenant we
// serve. That makes it our real scaling ceiling, and it means a per-request
// retry loop is exactly the wrong shape: the fix is to spend fewer calls.
//
// Two things keep us under it:
//   - Sync is FORWARD-ONLY. We never backfill a mailbox, so connecting a
//     ten-year-old inbox costs the same handful of calls as an empty one.
//   - Everything that does call Composio goes through this serialising pacer,
//     so a burst of webhook-driven hydrations becomes a queue rather than a
//     stampede.
//
// Honest limit: this paces ONE server instance. Vercel runs many, so this is a
// floor on politeness, not a guarantee of staying under the org limit. Any
// future bulk operation must be driven off the AgentTask queue (which is
// centrally rate-limited by the dispatcher's batch size) rather than fanned
// out here, and must watch the X-RateLimit-Remaining header on responses.
const MIN_CALL_GAP_MS = 60;
let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Run one Composio call through the shared pacer. */
export function composioCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_CALL_GAP_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  // Keep the chain alive even when a call rejects, or one failure would wedge
  // every later call behind a permanently rejected promise.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
