// The HYDRATION path: fill in what we already know we are looking at.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
//
// SocQ has no identity resolution. Machine-checked across all 102 endpoints:
// no endpoint accepts an email, none accepts a company domain for a social
// lookup, and no output carries a confidence, a match score, a candidate array
// or a verification flag. The only inputs are exact urls, exact usernames, and
// free-text query.
//
// So SocQ can only ever be a HYDRATION layer, never a RESOLUTION layer. It may
// be handed a canonical URL that our existing stack ALREADY verified (see
// src/lib/social-find.ts, which requires a name match AND a company match
// before it saves a profile), and nothing else. Scalar's hard accuracy rule is
// that enrichment must never attach data to the wrong person, and with no score
// to threshold on there is no safe way to turn a name into a profile here.
//
// That rule is enforced structurally, not by convention:
//   - no function in this file takes a URL from its caller. Ever. URLs are read
//     off the record, which is the only place a verified one can live.
//   - every URL is re-checked at use time: it must be shaped like a canonical
//     PROFILE page for its platform (a post URL is refused), and if our
//     provenance spine has an opinion about where it came from, that opinion
//     must clear the confidence bar.
//   - the discovery path (src/lib/social-discover.ts) lives in a different
//     module and has no route into this one.
//
// Everything here is async: we submit and enqueue a poll. See src/lib/socq.ts.

import { type Prisma, type SocialPlatform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { clampListLimit } from "@/lib/crm-operations";
import {
  PROFILE_ENDPOINTS,
  PROFILE_POSTS_ENDPOINTS,
  SOCQ_DEFAULT_RESULTS_LIMIT,
  clampResultsLimit,
  enqueueSocqPoll,
  resolveEndpoint,
  submitTask,
  type SocialPlatformKey,
  type SocqItem,
} from "@/lib/socq";

/* --------------------------------------------------------------------------
 * URL classification: is this a canonical profile page, and for what platform
 * ----------------------------------------------------------------------- */

export interface ClassifiedSocialUrl {
  platform: SocialPlatform;
  /** True only for a canonical profile/channel page. A post, a reel, a group,
   *  a search page or a directory listing is false, and false is never
   *  hydrated as a person. */
  isProfile: boolean;
  /** Handle when the URL shape carries one. Not all platforms do. */
  handle: string | null;
  normalizedUrl: string;
}

/**
 * Classify a social URL. Deliberately strict: an unrecognised host returns
 * null, and an ambiguous path returns isProfile false. Being wrong here is the
 * same-name-stranger bug with extra steps.
 */
export function classifySocialUrl(raw: string): ClassifiedSocialUrl | null {
  let u: URL;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const segs = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const normalizedUrl = `https://${host}${u.pathname.replace(/\/+$/, "")}`;
  const first = segs[0]?.toLowerCase() ?? "";

  if (host.endsWith("linkedin.com")) {
    // Personal profiles are /in/<slug>; company pages are /company/<slug>.
    if ((first === "in" || first === "company" || first === "school") && segs.length === 2) {
      return { platform: "LINKEDIN", isProfile: true, handle: segs[1], normalizedUrl };
    }
    return { platform: "LINKEDIN", isProfile: false, handle: null, normalizedUrl };
  }
  if (host === "x.com" || host === "twitter.com") {
    const reserved = new Set(["i", "home", "search", "hashtag", "intent", "share", "explore", "messages", "notifications"]);
    const isProfile = segs.length === 1 && !reserved.has(first);
    return { platform: "X", isProfile, handle: isProfile ? segs[0] : null, normalizedUrl };
  }
  if (host.endsWith("instagram.com")) {
    const reserved = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "direct"]);
    const isProfile = segs.length === 1 && !reserved.has(first);
    return { platform: "INSTAGRAM", isProfile, handle: isProfile ? segs[0] : null, normalizedUrl };
  }
  if (host.endsWith("facebook.com")) {
    const reserved = new Set([
      "groups", "events", "pages", "marketplace", "watch", "photo", "photos",
      "sharer", "share", "story.php", "profile.php", "public", "people", "permalink.php",
    ]);
    if (segs.length === 1 && !reserved.has(first)) {
      return { platform: "FACEBOOK", isProfile: true, handle: segs[0], normalizedUrl };
    }
    if (first === "people" && segs.length >= 2) {
      return { platform: "FACEBOOK", isProfile: true, handle: segs[segs.length - 1], normalizedUrl };
    }
    return { platform: "FACEBOOK", isProfile: false, handle: null, normalizedUrl };
  }
  if (host.endsWith("tiktok.com")) {
    const isProfile = segs.length === 1 && first.startsWith("@");
    return { platform: "TIKTOK", isProfile, handle: isProfile ? segs[0].slice(1) : null, normalizedUrl };
  }
  if (host.endsWith("youtube.com")) {
    if (segs.length === 1 && first.startsWith("@")) {
      return { platform: "YOUTUBE", isProfile: true, handle: segs[0].slice(1), normalizedUrl };
    }
    if ((first === "channel" || first === "c" || first === "user") && segs.length === 2) {
      return { platform: "YOUTUBE", isProfile: true, handle: segs[1], normalizedUrl };
    }
    return { platform: "YOUTUBE", isProfile: false, handle: null, normalizedUrl };
  }
  if (host.endsWith("reddit.com")) {
    if ((first === "user" || first === "u") && segs.length === 2) {
      return { platform: "REDDIT", isProfile: true, handle: segs[1], normalizedUrl };
    }
    return { platform: "REDDIT", isProfile: false, handle: null, normalizedUrl };
  }
  if (host.endsWith("threads.net") || host.endsWith("threads.com")) {
    const isProfile = segs.length === 1 && first.startsWith("@");
    return { platform: "THREADS", isProfile, handle: isProfile ? segs[0].slice(1) : null, normalizedUrl };
  }
  if (host.endsWith("pinterest.com")) {
    const reserved = new Set(["pin", "search", "ideas", "today"]);
    const isProfile = segs.length === 1 && !reserved.has(first);
    return { platform: "PINTEREST", isProfile, handle: isProfile ? segs[0] : null, normalizedUrl };
  }
  return null;
}

/* --------------------------------------------------------------------------
 * Provenance: where did this URL come from
 * ----------------------------------------------------------------------- */

/** A field written by a provider with a weaker-than-verified confidence is not
 *  a verified URL. src/lib/social-find.ts records tavily at 75 only after a
 *  name AND company match; "inferred" (40) and "derived" (55) never clear it. */
export const MIN_VERIFIED_CONFIDENCE = 70;

/** Sources that, whatever confidence they claim, are guesses by construction
 *  and may never be hydrated. Keyword search results live here. */
export const NEVER_VERIFIED_SOURCES = new Set(["inferred", "derived", "socq-search", "socq-discovery"]);

export type VerifiedBy = "operator" | "provenance";

export interface HydrationSource {
  recordType: "contact" | "entity";
  recordId: string;
  /** The record column or profile row this URL came from. */
  field: string;
  platform: SocialPlatform;
  url: string;
  handle: string | null;
  verifiedBy: VerifiedBy;
  provenanceSource: string | null;
  confidence: number | null;
}

export interface RefusedSource {
  field: string;
  url: string;
  reason: string;
}

/** The refusal messages, kept in one place so the MCP description, the REST
 *  error and the docs all say the same thing. */
export const REFUSAL = {
  notASocialUrl: "not a recognised social URL, so there is no platform to hydrate against",
  notAProfileUrl:
    "not a canonical profile page (it looks like a post, a group or a search result). SocQ returns no match score, so hydrating a non-profile URL as a person is exactly the same-name-stranger bug we refuse to ship",
  lowConfidenceProvenance:
    "recorded provenance says this value was inferred or guessed rather than verified against the person's name and company. Verify it first (find_socials) or have a human confirm it",
  noPlatformSupport: "SocQ has no profile endpoint for this platform",
} as const;

async function provenanceFor(
  recordType: "contact" | "entity",
  recordId: string,
): Promise<Map<string, { source: string; confidence: number }>> {
  const rows = await prisma.fieldProvenance.findMany({
    where: { recordType, recordId },
    select: { field: true, source: true, confidence: true },
  });
  return new Map(rows.map((r) => [r.field, { source: r.source, confidence: r.confidence }]));
}

/** Decide whether one candidate URL may be hydrated. Returns the refusal
 *  reason instead of throwing so a record with four URLs can hydrate the two
 *  that are clean and report honestly on the two that are not. */
export function checkHydrationCandidate(
  url: string,
  provenance: { source: string; confidence: number } | undefined,
): { ok: true; classified: ClassifiedSocialUrl; verifiedBy: VerifiedBy } | { ok: false; reason: string } {
  const classified = classifySocialUrl(url);
  if (!classified) return { ok: false, reason: REFUSAL.notASocialUrl };
  if (!classified.isProfile) return { ok: false, reason: REFUSAL.notAProfileUrl };
  if (!PROFILE_ENDPOINTS[classified.platform as SocialPlatformKey]) {
    return { ok: false, reason: REFUSAL.noPlatformSupport };
  }
  if (provenance) {
    if (
      NEVER_VERIFIED_SOURCES.has(provenance.source.toLowerCase()) ||
      provenance.confidence < MIN_VERIFIED_CONFIDENCE
    ) {
      return { ok: false, reason: REFUSAL.lowConfidenceProvenance };
    }
    return { ok: true, classified, verifiedBy: "provenance" };
  }
  // No provenance row means nothing in our pipeline wrote it, which means a
  // human put it on the record. That is the strongest signal we have.
  return { ok: true, classified, verifiedBy: "operator" };
}

export interface HydrationTarget {
  contactId?: string | null;
  entityId?: string | null;
}

function normalizeTarget(target: HydrationTarget): { recordType: "contact" | "entity"; recordId: string } {
  if (target.contactId && target.entityId) {
    throw new OpError("Pass a contactId or an entityId, not both.", 400);
  }
  if (target.contactId) return { recordType: "contact", recordId: target.contactId };
  if (target.entityId) return { recordType: "entity", recordId: target.entityId };
  throw new OpError("A contactId or an entityId is required.", 400);
}

/**
 * Collect every already-verified profile URL on a record.
 *
 * Contacts carry four social columns. Entities carry none, so their only
 * verified URLs are the SocialProfile rows an earlier verified hydration
 * already wrote. We do not go looking for a company's socials here: finding
 * them is a resolution problem and SocQ cannot resolve.
 */
export async function verifiedSocialUrls(
  userId: string,
  target: HydrationTarget,
): Promise<{ sources: HydrationSource[]; refused: RefusedSource[] }> {
  const { recordType, recordId } = normalizeTarget(target);
  const candidates: { field: string; url: string }[] = [];

  if (recordType === "contact") {
    const contact = await prisma.contact.findFirst({
      where: { id: recordId, userId },
      select: { id: true, linkedin: true, twitter: true, instagram: true, facebook: true },
    });
    if (!contact) throw new OpError("Contact not found", 404);
    for (const field of ["linkedin", "twitter", "instagram", "facebook"] as const) {
      const value = contact[field];
      if (value && value.trim()) candidates.push({ field, url: value.trim() });
    }
  } else {
    const entity = await prisma.entity.findFirst({ where: { id: recordId, userId }, select: { id: true } });
    if (!entity) throw new OpError("Company not found", 404);
  }

  // Existing profile rows count for both record types: they were written by a
  // hydration that already passed this same gate.
  const existing = await prisma.socialProfile.findMany({
    where: {
      userId,
      ...(recordType === "contact" ? { contactId: recordId } : { entityId: recordId }),
    },
    select: { platform: true, profileUrl: true },
  });
  for (const row of existing) {
    if (!candidates.some((c) => c.url === row.profileUrl)) {
      candidates.push({ field: `socialProfile:${row.platform}`, url: row.profileUrl });
    }
  }

  const provenance = await provenanceFor(recordType, recordId);
  const sources: HydrationSource[] = [];
  const refused: RefusedSource[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const prov = provenance.get(candidate.field);
    const verdict = checkHydrationCandidate(candidate.url, prov);
    if (!verdict.ok) {
      refused.push({ field: candidate.field, url: candidate.url, reason: verdict.reason });
      continue;
    }
    const key = `${verdict.classified.platform}:${verdict.classified.normalizedUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      recordType,
      recordId,
      field: candidate.field,
      platform: verdict.classified.platform,
      url: verdict.classified.normalizedUrl,
      handle: verdict.classified.handle,
      verifiedBy: verdict.verifiedBy,
      provenanceSource: prov?.source ?? null,
      confidence: prov?.confidence ?? null,
    });
  }
  return { sources, refused };
}

/* --------------------------------------------------------------------------
 * Submit hydration
 * ----------------------------------------------------------------------- */

export interface HydrationSubmission {
  platform: SocialPlatform;
  profileUrl: string;
  endpoint: string;
  socqTaskId: string;
  mode: "profile" | "posts";
  replayed: boolean;
}

export interface HydrateResult {
  recordType: "contact" | "entity";
  recordId: string;
  submitted: HydrationSubmission[];
  refused: RefusedSource[];
  message: string;
}

/**
 * Queue hydration for every verified profile URL on a record.
 *
 * Returns as soon as the submissions are accepted. SocQ is asynchronous end to
 * end, so results land later, written by the socq_poll handler into
 * SocialProfile and SocialPost rows.
 */
export async function hydrateRecordSocials(
  userId: string,
  target: HydrationTarget,
  opts: { includePosts?: boolean; postsLimit?: number; platform?: SocialPlatform } = {},
): Promise<HydrateResult> {
  const { recordType, recordId } = normalizeTarget(target);
  const { sources, refused } = await verifiedSocialUrls(userId, target);
  const wanted = opts.platform ? sources.filter((s) => s.platform === opts.platform) : sources;

  const includePosts = opts.includePosts !== false;
  const postsLimit = clampResultsLimit(opts.postsLimit ?? SOCQ_DEFAULT_RESULTS_LIMIT, 50);
  const submitted: HydrationSubmission[] = [];

  for (const source of wanted) {
    const platformKey = source.platform as SocialPlatformKey;

    const profileEndpoint = await resolveEndpoint(PROFILE_ENDPOINTS[platformKey] ?? []);
    const profileTask = await submitTask(userId, {
      platform: profileEndpoint.platform,
      resource: profileEndpoint.resource,
      // A URL we already verified, never a name and never a query.
      input: { urls: [source.url] },
      purpose: `Hydrate the ${source.platform} profile already on this ${recordType} (verified by ${source.verifiedBy})`,
      contactId: recordType === "contact" ? recordId : null,
      entityId: recordType === "entity" ? recordId : null,
      resultsLimit: 1,
      resultsLimitCeiling: 1,
    });
    submitted.push({
      platform: source.platform,
      profileUrl: source.url,
      endpoint: profileEndpoint.publicId,
      socqTaskId: profileTask.socqTaskId,
      mode: "profile",
      replayed: profileTask.replayed,
    });
    await enqueueSocqPoll(
      userId,
      {
        socqTaskId: profileTask.socqTaskId,
        mode: "profile",
        attempt: 0,
        platform: source.platform,
        profileUrl: source.url,
        contactId: recordType === "contact" ? recordId : null,
        entityId: recordType === "entity" ? recordId : null,
      },
      { reason: `Collect the ${source.platform} profile we asked SocQ for, so outreach has real context to work from.` },
    );

    const postsCandidates = PROFILE_POSTS_ENDPOINTS[platformKey];
    if (!includePosts || !postsCandidates) continue;

    const postsEndpoint = await resolveEndpoint(postsCandidates);
    const postsTask = await submitTask(userId, {
      platform: postsEndpoint.platform,
      resource: postsEndpoint.resource,
      input: { urls: [source.url] },
      purpose: `Hydrate recent ${source.platform} posts for a verified profile on this ${recordType}`,
      contactId: recordType === "contact" ? recordId : null,
      entityId: recordType === "entity" ? recordId : null,
      resultsLimit: postsLimit,
      resultsLimitCeiling: 50,
    });
    submitted.push({
      platform: source.platform,
      profileUrl: source.url,
      endpoint: postsEndpoint.publicId,
      socqTaskId: postsTask.socqTaskId,
      mode: "posts",
      replayed: postsTask.replayed,
    });
    await enqueueSocqPoll(
      userId,
      {
        socqTaskId: postsTask.socqTaskId,
        mode: "posts",
        attempt: 0,
        platform: source.platform,
        profileUrl: source.url,
        contactId: recordType === "contact" ? recordId : null,
        entityId: recordType === "entity" ? recordId : null,
      },
      { reason: `Collect recent ${source.platform} posts so the next message can reference something real.` },
    );
  }

  const message =
    submitted.length > 0
      ? `Queued ${submitted.length} SocQ ${submitted.length === 1 ? "call" : "calls"}. Results are asynchronous and land on the record once they finish; read them back with get_social_context.${refused.length > 0 ? ` ${refused.length} URL(s) were refused, see refused[].` : ""}`
      : refused.length > 0
        ? "Nothing was hydrated: every URL on this record was refused. See refused[] for why. We never guess a profile from a name."
        : "This record has no verified social profile URL yet. Verify one first (find_socials), then hydrate. We never guess a profile from a name.";

  return { recordType, recordId, submitted, refused, message };
}

/* --------------------------------------------------------------------------
 * Apply results (called by the socq_poll handler, never by a request)
 * ----------------------------------------------------------------------- */

function asJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

/** Write a hydrated profile onto the record. The profileUrl is the one we
 *  submitted, NOT one read out of the response: a provider that returns a
 *  different profile than the one we asked for must not be able to silently
 *  repoint the row at someone else. */
export async function applyProfileItems(
  userId: string,
  input: {
    platform: SocialPlatform;
    profileUrl: string;
    contactId?: string | null;
    entityId?: string | null;
    socqTaskId: string;
    items: SocqItem[];
  },
): Promise<{ profileId: string | null; written: boolean }> {
  const item = input.items[0];
  if (!item) return { profileId: null, written: false };

  const author = item.author;
  const data = {
    handle: author.handle,
    displayName: author.name,
    bio: author.bio,
    followers: author.followers,
    following: author.following,
    location: author.location,
    raw: asJson(item.raw),
    socqTaskId: input.socqTaskId,
    refreshedAt: new Date(),
  };

  const profile = await prisma.socialProfile.upsert({
    where: {
      userId_platform_profileUrl: {
        userId,
        platform: input.platform,
        profileUrl: input.profileUrl,
      },
    },
    create: {
      userId,
      platform: input.platform,
      profileUrl: input.profileUrl,
      contactId: input.contactId ?? null,
      entityId: input.entityId ?? null,
      ...data,
    },
    update: data,
  });
  return { profileId: profile.id, written: true };
}

/** Write hydrated posts. Deduped on [userId, postUrl] like everything else
 *  that ingests a feed, so re-hydrating a profile updates rather than doubles. */
export async function applyPostItems(
  userId: string,
  input: {
    platform: SocialPlatform;
    profileUrl: string;
    contactId?: string | null;
    entityId?: string | null;
    items: SocqItem[];
  },
): Promise<{ written: number; skipped: number }> {
  const profile = await prisma.socialProfile.findUnique({
    where: {
      userId_platform_profileUrl: { userId, platform: input.platform, profileUrl: input.profileUrl },
    },
    select: { id: true },
  });

  let written = 0;
  let skipped = 0;
  for (const item of input.items) {
    // No URL means no dedupe key and no way for a human to go look at it.
    if (!item.url) {
      skipped++;
      continue;
    }
    const data = {
      profileId: profile?.id ?? null,
      contactId: input.contactId ?? null,
      entityId: input.entityId ?? null,
      text: item.text,
      publishedAt: item.publishedAt,
      metrics: item.metrics ? asJson(item.metrics) : undefined,
      raw: asJson(item.raw),
    };
    await prisma.socialPost.upsert({
      where: { userId_postUrl: { userId, postUrl: item.url } },
      create: { userId, platform: input.platform, postUrl: item.url, ...data },
      update: data,
    });
    written++;
  }
  return { written, skipped };
}

/* --------------------------------------------------------------------------
 * Read back
 * ----------------------------------------------------------------------- */

export interface SocialContext {
  recordType: "contact" | "entity";
  recordId: string;
  profiles: {
    platform: SocialPlatform;
    profileUrl: string;
    handle: string | null;
    displayName: string | null;
    bio: string | null;
    followers: number | null;
    location: string | null;
    refreshedAt: Date;
  }[];
  posts: {
    platform: SocialPlatform;
    postUrl: string;
    text: string | null;
    publishedAt: Date | null;
    metrics: unknown;
  }[];
  pending: { socqTaskId: string; purpose: string; status: string; submittedAt: Date }[];
  note: string;
}

/** Everything we hold about a record's social presence, for use when drafting
 *  outreach. Read-only, tenant-scoped, no provider calls and no spend. */
export async function getSocialContext(
  userId: string,
  target: HydrationTarget,
  opts: { postLimit?: number } = {},
): Promise<SocialContext> {
  const { recordType, recordId } = normalizeTarget(target);
  const scope = recordType === "contact" ? { contactId: recordId } : { entityId: recordId };

  const [profiles, posts, pending] = await Promise.all([
    prisma.socialProfile.findMany({
      where: { userId, ...scope },
      orderBy: { refreshedAt: "desc" },
      take: 20,
      select: {
        platform: true, profileUrl: true, handle: true, displayName: true,
        bio: true, followers: true, location: true, refreshedAt: true,
      },
    }),
    prisma.socialPost.findMany({
      where: { userId, ...scope },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: clampListLimit(opts.postLimit ?? 20),
      select: { platform: true, postUrl: true, text: true, publishedAt: true, metrics: true },
    }),
    prisma.socqTask.findMany({
      where: { userId, ...scope, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: { socqTaskId: true, purpose: true, status: true, submittedAt: true },
    }),
  ]);

  return {
    recordType,
    recordId,
    profiles,
    posts,
    pending,
    note:
      "Everything here was hydrated from a profile URL this record already carried and that our stack verified. Nothing here was matched by name. Quote a post only if it is actually in posts[]; never describe a post you cannot see.",
  };
}
