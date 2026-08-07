// SocQ integration: the one place Scalar talks to api.socq.ai.
//
// Five facts about SocQ shape every line below, and none of them are optional:
//
//  1. EVERYTHING IS ASYNC. All 102 endpoints return {task_id, status} and you
//     poll GET /v1/tasks/{id} until succeeded|failed. That does not fit inside
//     a synchronous MCP tool call, so nothing here ever waits on a result: we
//     submit, record a SocqTask row, and let the leased task queue poll.
//  2. BILLING IS PER RESULT and dynamic (mode base_plus_result). results_limit
//     accepts up to 2000, so one careless call burns thousands of credits.
//     Every submission goes through clampResultsLimit, which caps far below the
//     server ceiling on purpose.
//  3. RETRIES COST MONEY unless an Idempotency-Key rides along. submitTask
//     ALWAYS derives one from the tenant plus the canonicalised input, so a
//     retry after a socket error replays the original task for free, and a
//     changed input is a loud 409 rather than a silent second bill.
//  4. PRICES ARE SERVER SIDE. Nothing here hardcodes a credit price; costs come
//     from the live catalog (cached, revalidated with ETag by the SDK) and the
//     authoritative number is the credits_amount on the finished task, which we
//     reconcile into our own meter exactly once.
//  5. THE PAYLOAD IS NOT SCHEMATIZED. Every endpoint returns the same items[]
//     envelope, but author, metrics, media and the items themselves are
//     declared additionalProperties:true with ZERO named sub-fields, and SocQ
//     rotates upstream scrapers by design. So the normalisers below try a list
//     of candidate key names, never assume a nested field exists, and always
//     keep the untouched blob in `raw`.
//
// Gating: SOCQ_API_KEY alone is not enough. SOCQ_ENABLED must also be "true",
// because SocQ's terms on STORING and RESELLING returned data are unread (their
// site is blocked to us) and our product persists third-party personal data
// into customer-owned CRMs, which is resale. The integration is built and
// dormant until procurement clears it. See docs/engineering/socq-integration.md.

import { createHash } from "node:crypto";
import { SocqClient, SocqApiError, type CatalogData, type Capability, type TaskData } from "@socq/core";
import { type Prisma, type SocqTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { enqueueTask } from "@/lib/tasks";

/* --------------------------------------------------------------------------
 * Configuration and the client singleton
 * ----------------------------------------------------------------------- */

/** The API key is platform level: one sk-... for every tenant. SocQ has no
 *  per-end-user OAuth and no workspace concept, so attribution per tenant is
 *  entirely our job (see SocqTask.userId and reconcileSocqCredits). */
export function isSocqConfigured(): boolean {
  return Boolean(process.env.SOCQ_API_KEY);
}

/** Configured AND switched on. The second flag is the procurement gate. */
export function isSocqEnabled(): boolean {
  return isSocqConfigured() && process.env.SOCQ_ENABLED === "true";
}

/** House pattern (see src/lib/tavily.ts): an unconfigured provider is a clean
 *  501 the agent can act on, not a 500. */
export function assertSocqEnabled(): void {
  if (!isSocqConfigured()) {
    throw new OpError("Social hydration is not configured (SOCQ_API_KEY missing).", 501);
  }
  if (!isSocqEnabled()) {
    throw new OpError(
      "Social hydration is installed but switched off (SOCQ_ENABLED is not \"true\"). It stays dormant until SocQ's storage and resale terms are cleared; see docs/engineering/socq-integration.md.",
      501,
    );
  }
}

let client: SocqClient | null = null;

export function socqClient(): SocqClient {
  assertSocqEnabled();
  if (!client) {
    client = new SocqClient({
      apiKey: process.env.SOCQ_API_KEY,
      // Only pass a base url when one is set, so the SDK default stands.
      ...(process.env.SOCQ_BASE_URL ? { baseUrl: process.env.SOCQ_BASE_URL } : {}),
      source: "rest",
    });
  }
  return client;
}

/** Test seam and config-change seam: drop the client and the catalog cache. */
export function resetSocqClient(): void {
  client = null;
  catalogCache = null;
}

/* --------------------------------------------------------------------------
 * results_limit: the single most expensive number in this file
 * ----------------------------------------------------------------------- */

/** What the server will actually accept. Documented here so nobody rediscovers
 *  it by accident; we never send anything near it. */
export const SOCQ_SERVER_MAX_RESULTS_LIMIT = 2000;

/** Our ceiling. At the observed worst case of 2.5 credits per result, 100
 *  results is 250 SocQ credits for one call, which is already a lot to spend
 *  without a human looking. Nothing may raise this at a call site. */
export const SOCQ_RESULTS_LIMIT_CEILING = 100;

/** What a caller gets when it does not say. Deliberately small. */
export const SOCQ_DEFAULT_RESULTS_LIMIT = 25;

/** Clamp to [1, ceiling]. Non-finite, missing, or hostile values fall back to
 *  the default rather than to the ceiling: an unparseable number is not a
 *  request for the maximum. */
export function clampResultsLimit(
  limit?: number | null,
  ceiling: number = SOCQ_RESULTS_LIMIT_CEILING,
): number {
  const cap = Math.min(
    Math.max(Math.trunc(Number.isFinite(ceiling) ? ceiling : SOCQ_RESULTS_LIMIT_CEILING), 1),
    SOCQ_RESULTS_LIMIT_CEILING,
  );
  if (limit == null || typeof limit !== "number" || !Number.isFinite(limit)) {
    return Math.min(SOCQ_DEFAULT_RESULTS_LIMIT, cap);
  }
  return Math.min(Math.max(Math.trunc(limit), 1), cap);
}

/** Result pages are capped at 100 per read (SocQ's own page cap). */
export const SOCQ_MAX_PAGE_LIMIT = 100;
export const SOCQ_DEFAULT_PAGE_LIMIT = 50;

export function clampPageLimit(limit?: number | null): number {
  if (limit == null || typeof limit !== "number" || !Number.isFinite(limit)) {
    return SOCQ_DEFAULT_PAGE_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), SOCQ_MAX_PAGE_LIMIT);
}

/* --------------------------------------------------------------------------
 * Catalog, cached
 * ----------------------------------------------------------------------- */

/** How long a fetched catalog is served without even a conditional request.
 *  The SDK sends If-None-Match on top of this, so a miss here is usually a
 *  cheap 304 rather than a full body. */
export const CATALOG_TTL_MS = 15 * 60_000;

let catalogCache: { data: CatalogData; fetchedAt: number } | null = null;

export async function getCatalog(opts: { force?: boolean } = {}): Promise<CatalogData> {
  const now = Date.now();
  if (!opts.force && catalogCache && now - catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return catalogCache.data;
  }
  const data = await socqClient()
    .catalog()
    .catch((e) => {
      throw socqOpError(e);
    });
  catalogCache = { data, fetchedAt: now };
  return data;
}

function capabilitiesOf(catalog: CatalogData | null): Capability[] {
  const items = catalog?.endpoints?.items;
  return Array.isArray(items) ? items : [];
}

/** Look one capability up by "platform/resource". Returns null when the
 *  catalog cannot be read at all, so callers can decide whether an outage
 *  should block them. */
export async function findCapability(publicId: string): Promise<Capability | null> {
  const wanted = publicId.trim().toLowerCase();
  let catalog: CatalogData | null = null;
  try {
    catalog = await getCatalog();
  } catch {
    return null;
  }
  return (
    capabilitiesOf(catalog).find(
      (c) => `${c.platform}/${c.resource}`.toLowerCase() === wanted || c.public_id?.toLowerCase() === wanted,
    ) ?? null
  );
}

export interface ResolvedEndpoint {
  platform: string;
  resource: string;
  publicId: string;
  /** True when we actually saw this endpoint in the live catalog. False means
   *  we fell back to our first candidate because the catalog was unreadable;
   *  the submission may still 404. */
  confirmed: boolean;
  capability: Capability | null;
}

/**
 * Pick the first candidate endpoint that the live catalog actually has.
 *
 * We do this instead of hardcoding resource names because SocQ's endpoint
 * naming is not documented anywhere we can read offline, and getting it wrong
 * is a 404 at best. Candidates are ordered by how likely they are; if the
 * catalog is unreachable we fall back to the first one rather than failing the
 * whole feature on a catalog outage.
 */
export async function resolveEndpoint(candidates: string[]): Promise<ResolvedEndpoint> {
  const cleaned = candidates.map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) throw new OpError("No SocQ endpoint candidates were supplied.", 500);

  let catalog: CatalogData | null = null;
  try {
    catalog = await getCatalog();
  } catch {
    catalog = null;
  }

  if (catalog) {
    const known = capabilitiesOf(catalog);
    for (const candidate of cleaned) {
      const hit = known.find(
        (c) => `${c.platform}/${c.resource}`.toLowerCase() === candidate || c.public_id?.toLowerCase() === candidate,
      );
      if (hit) {
        return {
          platform: hit.platform,
          resource: hit.resource,
          publicId: `${hit.platform}/${hit.resource}`,
          confirmed: true,
          capability: hit,
        };
      }
    }
    throw new OpError(
      `SocQ has no endpoint matching any of: ${cleaned.join(", ")}. The catalog changed; update the endpoint map in src/lib/socq.ts.`,
      501,
    );
  }

  const [platform, resource] = splitPublicId(cleaned[0]);
  return { platform, resource, publicId: cleaned[0], confirmed: false, capability: null };
}

function splitPublicId(publicId: string): [string, string] {
  const [platform, resource, ...rest] = publicId.split("/");
  if (!platform || !resource || rest.length > 0) {
    throw new OpError(`Invalid SocQ endpoint "${publicId}" (expected "platform/resource").`, 500);
  }
  return [platform, resource];
}

/* --------------------------------------------------------------------------
 * Credits: estimate before, reconcile after
 * ----------------------------------------------------------------------- */

/** The worst per-result price we have seen quoted (linkedin/profiles at 2.5).
 *  Used only when the live catalog cannot be read, so an estimate errs
 *  expensive rather than cheap. Never used to bill. */
export const WORST_CASE_SOCQ_CREDITS_PER_RESULT = 2.5;

/** SocQ credits are not Scalar credits. This multiplier is the house margin on
 *  a passthrough provider cost, configurable because SocQ prices move server
 *  side and we do not want a deploy to change a price. */
export function socqCreditMultiplier(): number {
  const raw = Number(process.env.SOCQ_CREDIT_MULTIPLIER);
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

/** Scalar credits for a given SocQ credit amount, rounded up: our meter is
 *  whole credits and we never round a real cost down to zero. */
export function scalarCreditsFor(socqCredits: number): number {
  if (!Number.isFinite(socqCredits) || socqCredits <= 0) return 0;
  return Math.max(1, Math.ceil(socqCredits * socqCreditMultiplier()));
}

/** Pre-flight estimate in SocQ credits for a submission, from the live
 *  catalog. base_plus_result with dynamic pricing means the quoted number is
 *  per result, so the ceiling is price * results_limit. */
export async function estimateSocqCredits(publicId: string, resultsLimit: number): Promise<number> {
  const capability = await findCapability(publicId);
  const perResult =
    capability && typeof capability.billing?.credits === "number" && capability.billing.credits > 0
      ? capability.billing.credits
      : WORST_CASE_SOCQ_CREDITS_PER_RESULT;
  return perResult * clampResultsLimit(resultsLimit);
}

/**
 * Refuse to submit when the tenant plainly cannot cover the worst case. This
 * is a gate, not a debit: the real charge lands in reconcileSocqCredits once
 * SocQ tells us what the task actually cost.
 */
export async function ensureSocqBudget(userId: string, estimatedSocqCredits: number): Promise<void> {
  const needed = scalarCreditsFor(estimatedSocqCredits);
  if (needed <= 0) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsRemaining: true },
  });
  if (!user || user.creditsRemaining < needed) {
    throw new OpError(
      `Out of credits: this social call could cost up to ${needed} credits. Upgrade your plan or wait for your monthly reset.`,
      402,
    );
  }
}

/**
 * Charge the tenant for a finished SocQ task, from the authoritative
 * credits_amount on the task.
 *
 * The decrement is unconditional, unlike spendCredits' guarded decrement, and
 * that is deliberate: by the time SocQ reports credits_amount the money is
 * already spent upstream. Refusing to record it would hand the result out
 * free and hide the cost. A tenant can therefore end a task slightly negative,
 * which then blocks every further gated action until they top up: the honest
 * outcome. Every debit is written to the ledger under action "socq_result".
 */
export async function reconcileSocqCredits(
  userId: string,
  socqCredits: number,
  ref?: string,
): Promise<number> {
  const cost = scalarCreditsFor(socqCredits);
  if (cost <= 0) return 0;

  const user = await prisma.user.update({
    where: { id: userId },
    data: { creditsRemaining: { decrement: cost } },
    select: { creditsRemaining: true },
  });

  // Best-effort audit trail; a ledger failure never fails reconciliation.
  try {
    await prisma.creditLedger.create({
      data: {
        userId,
        delta: -cost,
        balanceAfter: user?.creditsRemaining ?? 0,
        action: "socq_result",
        ref,
      },
    });
  } catch (e) {
    console.warn("[socq] ledger write failed", e);
  }
  return cost;
}

/* --------------------------------------------------------------------------
 * Idempotency
 * ----------------------------------------------------------------------- */

/** Deterministic JSON: keys sorted at every depth, so two logically identical
 *  inputs hash the same and a retry replays instead of re-billing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * The key we send on every submit. Tenant-scoped so two tenants asking the
 * same question never collide onto one billed task, and input-scoped so the
 * same question is free to ask twice while a changed question is a 409 rather
 * than a second bill.
 */
export function idempotencyKeyFor(
  userId: string,
  platform: string,
  resource: string,
  input: Record<string, unknown>,
  salt?: string,
): string {
  const digest = createHash("sha256")
    .update(`${userId}\n${platform}/${resource}\n${canonicalJson(input)}\n${salt ?? ""}`)
    .digest("hex");
  return `scalar-${digest.slice(0, 48)}`;
}

/* --------------------------------------------------------------------------
 * Errors
 * ----------------------------------------------------------------------- */

/** Pull a Retry-After style hint out of an error detail blob without assuming
 *  its shape. Returns null when there is nothing usable. */
export function retryAfterSecondsFrom(detail: unknown): number | null {
  if (detail == null || typeof detail !== "object") return null;
  const bag = detail as Record<string, unknown>;
  for (const key of ["retry_after", "retryAfter", "retry_after_seconds", "poll_after_seconds"]) {
    const value = bag[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.ceil(value);
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  }
  return null;
}

/** Turn a SocqApiError into the OpError shape the rest of Scalar speaks, with
 *  the operational meaning of each status spelled out rather than implied. */
export function socqOpError(e: unknown): OpError {
  if (e instanceof OpError) return e;
  if (e instanceof SocqApiError) {
    const retry = retryAfterSecondsFrom(e.detail);
    switch (e.status) {
      case 401:
        return new OpError("SocQ rejected our API key (401). Check SOCQ_API_KEY.", 502);
      case 402:
        return new OpError(
          "SocQ is out of platform credits (402). Do NOT retry this call unchanged; the account needs topping up first.",
          402,
        );
      case 403:
        return new OpError(
          "SocQ refused the call (403). A valid key can still be refused by their IP allowlist, so check the allowlist for this deployment's egress IP before assuming the key is wrong.",
          502,
        );
      case 404:
        return new OpError("SocQ has no such endpoint or task (404).", 404);
      case 409:
        return new OpError(
          "SocQ idempotency conflict (409): this key was already used with a different input. Change the request or use a new salt; do not strip the key.",
          409,
        );
      case 429:
        return new OpError(
          `SocQ rate limit (429).${retry != null ? ` Retry after ${retry}s.` : ""} This can be a request-rate limit or a credit-window limit; a credit-window limit will not clear by retrying sooner.`,
          429,
        );
      default:
        return new OpError(`SocQ request failed (${e.status}).`, e.status >= 500 ? 502 : 502);
    }
  }
  if (e instanceof Error) return new OpError(`SocQ request failed: ${e.message}`, 502);
  return new OpError("SocQ request failed.", 502);
}

/* --------------------------------------------------------------------------
 * Defensive normalisation
 *
 * UNVERIFIED TERRITORY. The response envelope is documented, the payload is
 * not: author, metrics, media and the items themselves are additionalProperties
 * with no named sub-fields, and SocQ rotates upstream scrapers so names drift
 * by design. Everything below is a candidate-key search with a null fallback,
 * and `raw` always carries the untouched object so nothing is lost when a name
 * we never guessed turns out to be the real one.
 * ----------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** First candidate key that holds a non-empty string. */
function pickString(bag: Record<string, unknown> | null, keys: string[]): string | null {
  if (!bag) return null;
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** First candidate key that parses as a date. Accepts ISO strings and unix
 *  seconds/milliseconds, because every scraper does it differently. */
function pickDate(bag: Record<string, unknown> | null, keys: string[]): Date | null {
  if (!bag) return null;
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value.trim());
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      // Below ~1e11 it is almost certainly seconds, above it milliseconds.
      const parsed = new Date(value < 1e11 ? value * 1000 : value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

const URL_KEYS = ["url", "link", "permalink", "post_url", "postUrl", "web_url", "share_url", "href"];
const TEXT_KEYS = [
  "text", "content", "caption", "body", "description", "message", "title",
  "post_text", "full_text", "transcript",
];
const PUBLISHED_KEYS = [
  "published_at", "publishedAt", "created_at", "createdAt", "timestamp", "time",
  "date", "taken_at", "posted_at", "publish_date",
];
const AUTHOR_NAME_KEYS = [
  "name", "full_name", "fullName", "display_name", "displayName", "nickname",
  "author_name", "title", "username", "handle",
];
const AUTHOR_HANDLE_KEYS = [
  "username", "handle", "screen_name", "screenName", "user_name", "nickname", "slug", "id",
];
const AUTHOR_URL_KEYS = ["url", "profile_url", "profileUrl", "link", "permalink", "profile_link"];
const BIO_KEYS = ["bio", "description", "about", "summary", "headline", "biography"];
const FOLLOWER_KEYS = [
  "followers", "followers_count", "followersCount", "follower_count",
  "subscribers", "subscriber_count", "connections",
];
const FOLLOWING_KEYS = ["following", "following_count", "followingCount", "follows_count", "friends_count"];
const LOCATION_KEYS = ["location", "city", "region", "country", "geo", "address"];

function pickCount(bag: Record<string, unknown> | null, keys: string[]): number | null {
  if (!bag) return null;
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    // "12.3K" / "1,234" are both things scrapers hand back.
    if (typeof value === "string") {
      const parsed = parseCompactCount(value);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

/** Parse "1,234", "12.3K", "4M". Returns null on anything else rather than
 *  guessing a number out of prose. */
export function parseCompactCount(raw: string): number | null {
  const text = raw.trim().replace(/,/g, "");
  const match = /^(\d+(?:\.\d+)?)\s*([kmb])?$/i.exec(text);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = match[2]?.toLowerCase();
  const factor = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(base * factor);
}

export interface SocqAuthor {
  name: string | null;
  handle: string | null;
  url: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  location: string | null;
  /** The untouched author blob, whatever shape it arrived in. */
  raw: unknown;
}

export interface SocqItem {
  platform: string | null;
  resource: string | null;
  type: string | null;
  id: string | null;
  url: string | null;
  text: string | null;
  publishedAt: Date | null;
  author: SocqAuthor;
  /** Only kept when it arrived as a plain object; anything else stays in raw. */
  metrics: Record<string, unknown> | null;
  media: unknown[] | null;
  /** The whole item, untouched. This is the field that survives a scraper
   *  rotation, so it is always written to the `raw` Json column. */
  raw: Record<string, unknown>;
}

export function normalizeAuthor(value: unknown): SocqAuthor {
  const bag = asRecord(value);
  return {
    name: pickString(bag, AUTHOR_NAME_KEYS),
    handle: pickString(bag, AUTHOR_HANDLE_KEYS),
    url: pickString(bag, AUTHOR_URL_KEYS),
    bio: pickString(bag, BIO_KEYS),
    followers: pickCount(bag, FOLLOWER_KEYS),
    following: pickCount(bag, FOLLOWING_KEYS),
    location: pickString(bag, LOCATION_KEYS),
    // A string author ("@someone") or a missing one both land here intact.
    raw: value ?? null,
  };
}

export function normalizeItem(value: unknown): SocqItem {
  const bag = asRecord(value) ?? {};
  const authorValue = "author" in bag ? bag.author : bag.user ?? bag.profile ?? null;
  const mediaValue = bag.media;
  return {
    platform: pickString(bag, ["platform"]),
    resource: pickString(bag, ["resource"]),
    type: pickString(bag, ["type", "kind"]),
    id: pickString(bag, ["id", "post_id", "item_id", "uid"]),
    url: pickString(bag, URL_KEYS),
    text: pickString(bag, TEXT_KEYS),
    publishedAt: pickDate(bag, PUBLISHED_KEYS),
    author: normalizeAuthor(authorValue),
    metrics: asRecord(bag.metrics),
    media: Array.isArray(mediaValue) ? mediaValue : null,
    raw: bag,
  };
}

/** Normalise an items[] array from anywhere in a task payload. Non-array and
 *  non-object entries are dropped rather than throwing: a malformed page must
 *  never take down a hydration run. */
export function normalizeItems(value: unknown): SocqItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => asRecord(item) !== null).map(normalizeItem);
}

/* --------------------------------------------------------------------------
 * Submit
 * ----------------------------------------------------------------------- */

export function mapSocqStatus(status: unknown): SocqTaskStatus {
  switch (String(status ?? "").toLowerCase()) {
    case "running":
    case "in_progress":
      return "RUNNING";
    case "succeeded":
    case "success":
    case "completed":
      return "SUCCEEDED";
    case "failed":
    case "error":
    case "cancelled":
      return "FAILED";
    default:
      return "QUEUED";
  }
}

export function isTerminal(status: SocqTaskStatus): boolean {
  return status === "SUCCEEDED" || status === "FAILED";
}

export interface SubmitTaskInput {
  platform: string;
  resource: string;
  /** Endpoint input, minus results_limit which this function owns. */
  input: Record<string, unknown>;
  /** Why this call exists, stored on the SocqTask row and readable by an
   *  operator looking at a bill. */
  purpose: string;
  contactId?: string | null;
  entityId?: string | null;
  monitorId?: string | null;
  resultsLimit?: number;
  /** Lower the cap further for a specific call (never raises it). */
  resultsLimitCeiling?: number;
  /** Deliberately force a fresh task for the same input (for example a
   *  scheduled monitor re-running the same query tomorrow). */
  idempotencySalt?: string;
}

export interface SubmitTaskResult {
  taskRowId: string;
  socqTaskId: string;
  status: SocqTaskStatus;
  idempotencyKey: string;
  resultsLimit: number;
  /** True when we returned an existing submission instead of paying for a new
   *  one, either from our own SocqTask table or from SocQ's replay. */
  replayed: boolean;
}

/**
 * Submit one SocQ task and record it. Never waits for the result.
 *
 * Invariants this function guarantees, and which tests assert:
 *   - results_limit is ALWAYS present and ALWAYS clamped.
 *   - an Idempotency-Key is ALWAYS sent.
 *   - a SocqTask row always exists for a submission that reached SocQ, so a
 *     result can be routed back to the record or monitor that asked for it.
 */
export async function submitTask(userId: string, args: SubmitTaskInput): Promise<SubmitTaskResult> {
  assertSocqEnabled();

  const platform = args.platform.trim().toLowerCase();
  const resource = args.resource.trim().toLowerCase();
  if (!platform || !resource) throw new OpError("A SocQ platform and resource are required.", 400);

  const resultsLimit = clampResultsLimit(args.resultsLimit, args.resultsLimitCeiling);
  const payload: Record<string, unknown> = { ...args.input, results_limit: resultsLimit };
  const idempotencyKey = idempotencyKeyFor(userId, platform, resource, payload, args.idempotencySalt);

  // Our own replay guard, ahead of SocQ's: if we already submitted this exact
  // question for this tenant and it did not fail, hand the existing task back
  // rather than paying to ask again.
  const existing = await prisma.socqTask.findFirst({ where: { userId, idempotencyKey } });
  if (existing && existing.status !== "FAILED") {
    return {
      taskRowId: existing.id,
      socqTaskId: existing.socqTaskId,
      status: existing.status,
      idempotencyKey,
      resultsLimit,
      replayed: true,
    };
  }

  await ensureSocqBudget(userId, await estimateSocqCredits(`${platform}/${resource}`, resultsLimit));

  let data: TaskData;
  try {
    data = await socqClient().submit(platform, resource, payload, { idempotencyKey });
  } catch (e) {
    throw socqOpError(e);
  }

  const socqTaskId = typeof data?.task_id === "string" && data.task_id ? data.task_id : null;
  if (!socqTaskId) {
    throw new OpError("SocQ accepted the submission but returned no task id.", 502);
  }
  const status = mapSocqStatus(data.status);

  // Upsert on socqTaskId: an idempotent replay hands back the ORIGINAL task id,
  // which may already have a row (for instance after a failed row was retried
  // with the same key).
  const row = await prisma.socqTask.upsert({
    where: { socqTaskId },
    create: {
      userId,
      socqTaskId,
      idempotencyKey,
      platform,
      resource,
      status,
      purpose: args.purpose.slice(0, 500),
      contactId: args.contactId ?? null,
      entityId: args.entityId ?? null,
      monitorId: args.monitorId ?? null,
    },
    update: { status, idempotencyKey },
  });

  return {
    taskRowId: row.id,
    socqTaskId,
    status,
    idempotencyKey,
    resultsLimit,
    replayed: data.idempotent_replay === true,
  };
}

/* --------------------------------------------------------------------------
 * Poll
 * ----------------------------------------------------------------------- */

export interface PollTaskOptions {
  cursor?: string;
  /** Results per page. Capped at SOCQ_MAX_PAGE_LIMIT. */
  limit?: number;
}

export interface PollTaskResult {
  socqTaskId: string;
  status: SocqTaskStatus;
  done: boolean;
  items: SocqItem[];
  hasMore: boolean;
  /** Pass straight back into pollTask unchanged. */
  nextCursor: string | null;
  resultCount: number | null;
  /** What SocQ says the task cost, in SocQ credits. */
  creditsAmount: number | null;
  /** Scalar credits debited by THIS call. Non-zero at most once per task. */
  creditsCharged: number;
  pollAfterSeconds: number | null;
  errorMessage: string | null;
  purpose: string;
  contactId: string | null;
  entityId: string | null;
  monitorId: string | null;
}

/**
 * Read a submitted task's current state, update our row, and reconcile the
 * cost exactly once.
 *
 * Once-only charging is enforced at the storage layer, not with an if: the
 * updateMany is conditioned on creditsAmount still being null, so two
 * dispatchers polling the same task concurrently can only have one of them win
 * the right to debit.
 */
export async function pollTask(
  userId: string,
  socqTaskId: string,
  opts: PollTaskOptions = {},
): Promise<PollTaskResult> {
  assertSocqEnabled();

  const row = await prisma.socqTask.findFirst({ where: { socqTaskId, userId } });
  if (!row) throw new OpError("Social task not found", 404);

  let data: TaskData;
  try {
    data = await socqClient().task(socqTaskId, {
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      limit: clampPageLimit(opts.limit),
    });
  } catch (e) {
    throw socqOpError(e);
  }

  const status = mapSocqStatus(data.status);
  const done = isTerminal(status);
  const creditsAmount =
    typeof data.credits_amount === "number" && Number.isFinite(data.credits_amount)
      ? data.credits_amount
      : null;
  const resultCount =
    typeof data.result_count === "number" && Number.isFinite(data.result_count)
      ? Math.trunc(data.result_count)
      : null;
  const errorMessage = typeof data.error_message === "string" ? data.error_message : null;

  await prisma.socqTask.update({
    where: { id: row.id },
    data: {
      status,
      ...(resultCount != null ? { resultCount } : {}),
      ...(errorMessage ? { errorMessage: errorMessage.slice(0, 2000) } : {}),
      ...(done ? { finishedAt: new Date() } : {}),
    },
  });

  // Reconcile the real cost once, and only once.
  let creditsCharged = 0;
  if (creditsAmount != null && creditsAmount > 0) {
    const claim = await prisma.socqTask.updateMany({
      where: { id: row.id, creditsAmount: null },
      data: { creditsAmount },
    });
    if (claim.count === 1) {
      creditsCharged = await reconcileSocqCredits(userId, creditsAmount, socqTaskId);
    }
  }

  const results = asRecord(data.results);
  return {
    socqTaskId,
    status,
    done,
    items: normalizeItems(results?.items),
    hasMore: results?.has_more === true,
    nextCursor: typeof results?.next_cursor === "string" ? results.next_cursor : null,
    resultCount,
    creditsAmount,
    creditsCharged,
    pollAfterSeconds:
      typeof data.poll_after_seconds === "number" && Number.isFinite(data.poll_after_seconds)
        ? Math.max(0, Math.ceil(data.poll_after_seconds))
        : null,
    errorMessage,
    purpose: row.purpose,
    contactId: row.contactId,
    entityId: row.entityId,
    monitorId: row.monitorId,
  };
}

/* --------------------------------------------------------------------------
 * Polling off the request path
 *
 * A submission is not a result. The queue is what turns SocQ's async contract
 * into something a tenant can rely on: submit, enqueue a socq_poll row, let
 * the leased dispatcher come back for the answer. Nothing in an HTTP request
 * or an MCP tool call ever waits.
 * ----------------------------------------------------------------------- */

export const SOCQ_POLL_KIND = "socq_poll";

/** How many times one task may be polled before we give up on it. At the
 *  default delay this is roughly twenty minutes of patience, which is longer
 *  than the SDK's own 90s waitTask by design: a queued scrape is normal. */
export const MAX_SOCQ_POLL_ATTEMPTS = 40;

/** Used when SocQ does not send poll_after_seconds. */
export const DEFAULT_POLL_DELAY_SECONDS = 20;

/** What a finished task should be turned into. The mode is what makes a
 *  discovery result physically unable to reach the hydration writer. */
export type SocqPollMode = "profile" | "posts" | "discover" | "transcript";

export interface SocqPollPayload {
  socqTaskId: string;
  mode: SocqPollMode;
  attempt: number;
  platform?: string;
  /** The canonical, already-verified profile URL this hydration is for. Never
   *  present on a discover payload. */
  profileUrl?: string;
  contactId?: string | null;
  entityId?: string | null;
  monitorId?: string | null;
}

/** Each poll attempt gets its own dedupe ref, otherwise the next attempt would
 *  be deduped against the attempt that is enqueueing it. */
export function socqPollRef(socqTaskId: string, attempt: number): string {
  return `${socqTaskId}#${attempt}`;
}

export function readSocqPollPayload(payload: unknown): SocqPollPayload | null {
  const bag = payload == null || typeof payload !== "object" || Array.isArray(payload)
    ? null
    : (payload as Record<string, unknown>);
  if (!bag) return null;
  const socqTaskId = typeof bag.socqTaskId === "string" ? bag.socqTaskId : null;
  const mode = bag.mode;
  if (!socqTaskId) return null;
  if (mode !== "profile" && mode !== "posts" && mode !== "discover" && mode !== "transcript") return null;
  return {
    socqTaskId,
    mode,
    attempt: typeof bag.attempt === "number" && Number.isFinite(bag.attempt) ? Math.trunc(bag.attempt) : 0,
    platform: typeof bag.platform === "string" ? bag.platform : undefined,
    profileUrl: typeof bag.profileUrl === "string" ? bag.profileUrl : undefined,
    contactId: typeof bag.contactId === "string" ? bag.contactId : null,
    entityId: typeof bag.entityId === "string" ? bag.entityId : null,
    monitorId: typeof bag.monitorId === "string" ? bag.monitorId : null,
  };
}

/** Queue the next look at a submitted task. `reason` is mandatory upstream in
 *  enqueueTask and is shown to the operator verbatim, so it says what this
 *  poll is for in words, not in ids. */
export async function enqueueSocqPoll(
  userId: string,
  payload: SocqPollPayload,
  opts: { reason: string; delaySeconds?: number },
): Promise<void> {
  const delay = Math.max(opts.delaySeconds ?? DEFAULT_POLL_DELAY_SECONDS, 1);
  await enqueueTask(userId, {
    kind: SOCQ_POLL_KIND,
    reason: opts.reason,
    dueAt: new Date(Date.now() + delay * 1000),
    ref: socqPollRef(payload.socqTaskId, payload.attempt),
    contactId: payload.contactId ?? null,
    entityId: payload.entityId ?? null,
    payload: { ...payload } as unknown as Prisma.InputJsonValue,
  });
}

/* --------------------------------------------------------------------------
 * The endpoint map
 *
 * SocQ's resource names are not documented anywhere we can read offline, so
 * every entry is an ORDERED list of candidates and resolveEndpoint() picks the
 * first one the live catalog actually has. Getting this wrong is a 404, not a
 * wrong answer, and a catalog change surfaces as a clear 501 telling us to
 * update this map.
 *
 * Two scope facts are enforced by absence, not by comment:
 *   - LINKEDIN has no discovery entry. All four LinkedIn endpoints require
 *     urls, and there is no LinkedIn search of any kind.
 *   - FACEBOOK discovery is group-posts only, and group-posts needs group URLs
 *     the operator already holds. There is no group DISCOVERY endpoint, so we
 *     cannot go find groups about a topic.
 * ----------------------------------------------------------------------- */

export type SocialPlatformKey =
  | "LINKEDIN" | "X" | "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | "YOUTUBE" | "REDDIT" | "THREADS" | "PINTEREST";

/** Profile hydration: given a canonical profile URL, fetch the profile. */
export const PROFILE_ENDPOINTS: Partial<Record<SocialPlatformKey, string[]>> = {
  LINKEDIN: ["linkedin/profiles"],
  X: ["x/profiles", "twitter/profiles", "x/users"],
  INSTAGRAM: ["instagram/profiles", "instagram/users"],
  FACEBOOK: ["facebook/profiles", "facebook/pages"],
  TIKTOK: ["tiktok/profiles", "tiktok/users"],
  YOUTUBE: ["youtube/channels", "youtube/profiles"],
  REDDIT: ["reddit/profiles", "reddit/users"],
  THREADS: ["threads/profiles", "threads/users"],
  PINTEREST: ["pinterest/profiles", "pinterest/users"],
};

/** Recent posts for a canonical profile URL. */
export const PROFILE_POSTS_ENDPOINTS: Partial<Record<SocialPlatformKey, string[]>> = {
  LINKEDIN: ["linkedin/profile-posts", "linkedin/posts"],
  X: ["x/profile-posts", "x/user-tweets", "twitter/user-tweets"],
  INSTAGRAM: ["instagram/profile-posts", "instagram/user-posts", "instagram/posts"],
  FACEBOOK: ["facebook/profile-posts", "facebook/page-posts", "facebook/posts"],
  TIKTOK: ["tiktok/profile-videos", "tiktok/user-videos"],
  YOUTUBE: ["youtube/channel-videos", "youtube/videos"],
  REDDIT: ["reddit/user-posts", "reddit/profile-posts"],
  THREADS: ["threads/profile-posts", "threads/user-posts"],
  PINTEREST: ["pinterest/profile-pins", "pinterest/user-pins"],
};

/** Keyword discovery. LinkedIn is absent on purpose: there is no LinkedIn
 *  search endpoint, and pretending otherwise would be a lie in a tool
 *  description. */
export const SEARCH_ENDPOINTS: Partial<Record<SocialPlatformKey, string[]>> = {
  X: ["x/search", "twitter/search"],
  INSTAGRAM: ["instagram/hashtag-posts", "instagram/search"],
  TIKTOK: ["tiktok/search", "tiktok/hashtag-videos"],
  YOUTUBE: ["youtube/search"],
  REDDIT: ["reddit/search", "reddit/subreddit-posts"],
  THREADS: ["threads/search"],
  PINTEREST: ["pinterest/search"],
};

/** Community/group watching from URLs the operator already supplies. */
export const COMMUNITY_ENDPOINTS: Partial<Record<SocialPlatformKey, string[]>> = {
  FACEBOOK: ["facebook/group-posts"],
  REDDIT: ["reddit/subreddit-posts", "reddit/search"],
  X: ["x/list-posts", "x/search"],
};

/** Video transcription. Genuinely differentiated versus our other providers,
 *  which is why it is exposed to the agent directly. */
export const TRANSCRIPT_ENDPOINTS: Partial<Record<SocialPlatformKey, string[]>> = {
  YOUTUBE: ["youtube/transcripts"],
  TIKTOK: ["tiktok/video-transcript"],
  INSTAGRAM: ["instagram/transcript"],
  FACEBOOK: ["facebook/video-transcript"],
};

/** Read every page of a finished task, bounded. Used by the handlers, which
 *  need the whole result set to write rows, not one page. */
export async function collectTaskItems(
  userId: string,
  socqTaskId: string,
  opts: { maxItems?: number } = {},
): Promise<{ items: SocqItem[]; result: PollTaskResult }> {
  const maxItems = Math.min(Math.max(opts.maxItems ?? SOCQ_RESULTS_LIMIT_CEILING, 1), SOCQ_RESULTS_LIMIT_CEILING);
  let cursor: string | undefined;
  const items: SocqItem[] = [];
  let last = await pollTask(userId, socqTaskId, { limit: SOCQ_MAX_PAGE_LIMIT });
  items.push(...last.items);
  cursor = last.nextCursor ?? undefined;

  // Hard page ceiling as well as an item ceiling: a provider that always says
  // has_more must not be able to loop us forever.
  let pages = 1;
  while (cursor && items.length < maxItems && pages < 10) {
    last = await pollTask(userId, socqTaskId, { cursor, limit: SOCQ_MAX_PAGE_LIMIT });
    items.push(...last.items);
    cursor = last.nextCursor ?? undefined;
    pages++;
  }
  return { items: items.slice(0, maxItems), result: last };
}
