// Monitors and the opportunity review queue: the human end of social discovery.
//
// Conversion is the whole point of this module, and it has exactly one rule:
// an opportunity is attached to an identity the operator ALREADY has, or it is
// not attached at all. There is no path here that creates a Contact or an
// Entity from a post author, because a post author carries no identity signal
// we could verify: SocQ returns no confidence, no match score, no candidates
// and no verification flag, so "the person who wrote this post" is a name and
// nothing more. Turning that into a CRM record is the same-name-stranger bug.
//
// If the operator wants a new contact, they create one (create_contact), verify
// it the way every other contact is verified, and then convert against it.

import { type SocialPlatform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { clampListLimit } from "@/lib/crm-operations";
import { planFor } from "@/lib/credits";
import { MONITOR_RESULTS_CEILING } from "@/lib/social-discover";
import { clampResultsLimit } from "@/lib/socq";

export const SOCIAL_PLATFORMS = [
  "LINKEDIN", "X", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "REDDIT", "THREADS", "PINTEREST",
] as const;

export const MONITOR_FREQUENCIES = ["hourly", "daily", "weekly"] as const;

/** Platforms a keyword monitor can actually watch. LinkedIn is absent because
 *  SocQ has no LinkedIn search of any kind; Facebook is absent because it can
 *  only read group URLs the operator already supplies. */
export const SEARCHABLE_PLATFORMS = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "REDDIT", "THREADS", "PINTEREST"] as const;

/** Platforms that can be watched from community URLs the operator supplies. */
export const COMMUNITY_PLATFORMS = ["FACEBOOK", "REDDIT", "X"] as const;

export interface CreateMonitorInput {
  name: string;
  platform: SocialPlatform;
  query?: string | null;
  sourceUrls?: string[];
  resultsLimit?: number;
  publishedWithin?: string | null;
  frequency?: string;
}

function cleanUrls(urls: string[] | undefined): string[] {
  return (urls ?? [])
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && /^https?:\/\//i.test(u))
    .slice(0, 20);
}

export async function createSocialMonitor(userId: string, input: CreateMonitorInput) {
  const name = input.name?.trim();
  if (!name) throw new OpError("A monitor needs a name.", 400);

  // Scheduled monitors are a paid-plan feature with a per-plan cap, and social
  // monitors and intent monitors both draw on the same `monitors` allotment:
  // they are the same scarce thing (a recurring web watch that spends credits
  // unattended), so counting them separately would let a free user (0 monitors)
  // stand up unlimited social watches, which is exactly the bypass this closes.
  // Enforced in the ops layer so both the REST route and the MCP tool are
  // covered, unlike the intent path which only guards at its route.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const allowed = planFor(user?.plan).monitors;
  const [social, intent] = await Promise.all([
    prisma.socialMonitor.count({ where: { userId } }),
    prisma.intentMonitor.count({ where: { userId } }),
  ]);
  if (social + intent >= allowed) {
    throw new OpError(
      `Your plan allows ${allowed} scheduled monitor${allowed === 1 ? "" : "s"} (intent and social combined). Upgrade or retire one first.`,
      402,
    );
  }

  const sourceUrls = cleanUrls(input.sourceUrls);
  const query = input.query?.trim() || null;
  if (!query && sourceUrls.length === 0) {
    throw new OpError("A monitor needs either a keyword query or at least one community URL to watch.", 400);
  }
  if (query && input.platform === "LINKEDIN") {
    throw new OpError(
      "LinkedIn cannot be searched: all four SocQ LinkedIn endpoints require exact URLs and there is no LinkedIn search. Watch another platform.",
      400,
    );
  }
  if (query && input.platform === "FACEBOOK") {
    throw new OpError(
      "Facebook has no keyword search and no group discovery. Supply the Facebook group URLs you already have instead of a query.",
      400,
    );
  }
  const frequency = (MONITOR_FREQUENCIES as readonly string[]).includes(input.frequency ?? "")
    ? (input.frequency as string)
    : "daily";

  return prisma.socialMonitor.create({
    data: {
      userId,
      name: name.slice(0, 200),
      platform: input.platform,
      query: query?.slice(0, 500) ?? null,
      sourceUrls,
      resultsLimit: clampResultsLimit(input.resultsLimit, MONITOR_RESULTS_CEILING),
      publishedWithin: input.publishedWithin?.trim().slice(0, 50) || null,
      frequency,
      nextRunAt: new Date(),
    },
  });
}

export function listSocialMonitors(userId: string, opts: { limit?: number } = {}) {
  return prisma.socialMonitor.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: clampListLimit(opts.limit),
  });
}

export async function getSocialMonitor(userId: string, id: string) {
  const monitor = await prisma.socialMonitor.findFirst({ where: { id, userId } });
  if (!monitor) throw new OpError("Monitor not found", 404);
  return monitor;
}

export async function updateSocialMonitor(
  userId: string,
  id: string,
  input: { name?: string; active?: boolean; frequency?: string; resultsLimit?: number },
) {
  await getSocialMonitor(userId, id);
  return prisma.socialMonitor.update({
    where: { id },
    data: {
      ...(input.name?.trim() ? { name: input.name.trim().slice(0, 200) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...((MONITOR_FREQUENCIES as readonly string[]).includes(input.frequency ?? "")
        ? { frequency: input.frequency as string }
        : {}),
      ...(input.resultsLimit !== undefined
        ? { resultsLimit: clampResultsLimit(input.resultsLimit, MONITOR_RESULTS_CEILING) }
        : {}),
    },
  });
}

export async function deleteSocialMonitor(userId: string, id: string) {
  const res = await prisma.socialMonitor.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new OpError("Monitor not found", 404);
  return { id, deleted: true };
}

/* --------------------------------------------------------------------------
 * The review queue
 * ----------------------------------------------------------------------- */

export interface ListOpportunitiesInput {
  status?: string;
  monitorId?: string;
  minIntentScore?: number;
  limit?: number;
}

const OPPORTUNITY_STATUSES = ["NEW", "REVIEWED", "DISMISSED", "CONVERTED"] as const;
type OpportunityStatusName = (typeof OPPORTUNITY_STATUSES)[number];

export function listSocialOpportunities(userId: string, input: ListOpportunitiesInput = {}) {
  const status = (OPPORTUNITY_STATUSES as readonly string[]).includes(input.status ?? "")
    ? (input.status as OpportunityStatusName)
    : undefined;
  const minScore =
    typeof input.minIntentScore === "number" && Number.isFinite(input.minIntentScore)
      ? Math.min(Math.max(Math.trunc(input.minIntentScore), 0), 100)
      : undefined;

  return prisma.socialOpportunity.findMany({
    where: {
      userId,
      status: status ?? "NEW",
      ...(input.monitorId ? { monitorId: input.monitorId } : {}),
      ...(minScore != null ? { intentScore: { gte: minScore } } : {}),
    },
    orderBy: [{ intentScore: "desc" }, { createdAt: "desc" }],
    take: clampListLimit(input.limit),
    include: { monitor: { select: { id: true, name: true, platform: true } } },
  });
}

async function getOwnedOpportunity(userId: string, id: string) {
  const opportunity = await prisma.socialOpportunity.findFirst({ where: { id, userId } });
  if (!opportunity) throw new OpError("Opportunity not found", 404);
  return opportunity;
}

export async function dismissSocialOpportunity(userId: string, id: string) {
  const opportunity = await getOwnedOpportunity(userId, id);
  if (opportunity.status === "CONVERTED") {
    throw new OpError("This opportunity was already converted.", 409);
  }
  return prisma.socialOpportunity.update({
    where: { id },
    data: { status: "DISMISSED" },
  });
}

export interface ConvertOpportunityInput {
  /** An EXISTING contact this post belongs to. You must already know it does. */
  contactId?: string | null;
  /** Or an EXISTING company. */
  entityId?: string | null;
}

export const CONVERSION_RULE =
  "An opportunity is attached to a contact or company you ALREADY have and have ALREADY verified. It never creates one. The person who wrote a post is, to us, a display name on a page: SocQ returns no confidence, no match score and no verification of any kind, so there is no honest way to turn a post author into a CRM record. If this really is a new person, create and verify the contact first, then convert against it.";

/**
 * Attach a reviewed opportunity to an identity the operator already holds.
 *
 * Note what this function does NOT do: it does not create a Contact, it does
 * not create an Entity, and it does not copy the post author onto either. It
 * links the opportunity, marks it CONVERTED, and stops. The post text and URL
 * stay on the opportunity where a human can always re-read them.
 */
export async function convertSocialOpportunity(
  userId: string,
  id: string,
  input: ConvertOpportunityInput,
) {
  const opportunity = await getOwnedOpportunity(userId, id);
  if (opportunity.status === "CONVERTED") {
    throw new OpError("This opportunity was already converted.", 409);
  }
  if (!input.contactId && !input.entityId) {
    throw new OpError(`A contactId or entityId is required. ${CONVERSION_RULE}`, 400);
  }
  if (input.contactId && input.entityId) {
    throw new OpError("Attach to a contact or a company, not both.", 400);
  }

  // The identity must already exist AND belong to this tenant. This read is
  // the verification: we attach to what the operator has, never to what a
  // provider claimed.
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, userId },
      select: { id: true },
    });
    if (!contact) {
      throw new OpError(`Contact not found. ${CONVERSION_RULE}`, 404);
    }
  }
  if (input.entityId) {
    const entity = await prisma.entity.findFirst({
      where: { id: input.entityId, userId },
      select: { id: true },
    });
    if (!entity) {
      throw new OpError(`Company not found. ${CONVERSION_RULE}`, 404);
    }
  }

  return prisma.socialOpportunity.update({
    where: { id },
    data: {
      status: "CONVERTED",
      contactId: input.contactId ?? null,
      entityId: input.entityId ?? null,
    },
  });
}
