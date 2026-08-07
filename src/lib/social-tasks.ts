// SocQ work, off the request path.
//
// Every SocQ endpoint is asynchronous: you submit, you get a task_id, and you
// poll until it finishes. Nothing about that fits inside an MCP tool call or an
// HTTP request, so this module is the seam. Three task kinds, all leased and
// retried by the existing dispatcher (src/lib/dispatch.ts):
//
//   social_hydrate  - fill in profiles and posts for ONE record's already
//                     verified social URLs. Submits; does not wait.
//   social_discover - run ONE saved monitor. Submits; does not wait.
//   socq_poll       - look at a submitted SocQ task, write whatever came back,
//                     and re-queue itself until the task is terminal.
//
// The reason string on every enqueue is mandatory upstream and is shown to the
// operator word for word, so it says what the work is for in plain language.

import { type Prisma, type SocialPlatform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { enqueueTask } from "@/lib/tasks";
import { registerTaskHandler, type TaskHandler } from "@/lib/dispatch";
import {
  DEFAULT_POLL_DELAY_SECONDS,
  MAX_SOCQ_POLL_ATTEMPTS,
  SOCQ_POLL_KIND,
  TRANSCRIPT_ENDPOINTS,
  collectTaskItems,
  enqueueSocqPoll,
  readSocqPollPayload,
  resolveEndpoint,
  submitTask,
  type SocialPlatformKey,
} from "@/lib/socq";
import { applyPostItems, applyProfileItems, classifySocialUrl, hydrateRecordSocials } from "@/lib/social-hydrate";
import { applyDiscoveryItems, dueMonitors, runSocialMonitor } from "@/lib/social-discover";

export const SOCIAL_TASK_KIND = {
  hydrate: "social_hydrate",
  discover: "social_discover",
  poll: SOCQ_POLL_KIND,
} as const;

/* --------------------------------------------------------------------------
 * Enqueue helpers (called from MCP tools and REST routes)
 * ----------------------------------------------------------------------- */

export interface EnqueueHydrateInput {
  contactId?: string | null;
  entityId?: string | null;
  reason: string;
  includePosts?: boolean;
  platform?: SocialPlatform;
}

/** Queue hydration for one record. Deduped per record while one is still
 *  outstanding, so an agent looping over a list cannot queue the same work
 *  fifty times. */
export async function enqueueSocialHydrate(userId: string, input: EnqueueHydrateInput) {
  if (!input.contactId && !input.entityId) {
    throw new OpError("A contactId or an entityId is required.", 400);
  }
  return enqueueTask(userId, {
    kind: SOCIAL_TASK_KIND.hydrate,
    reason: input.reason,
    contactId: input.contactId ?? null,
    entityId: input.entityId ?? null,
    payload: {
      includePosts: input.includePosts !== false,
      ...(input.platform ? { platform: input.platform } : {}),
    } as Prisma.InputJsonValue,
    // An hour of quiet after one finishes: hydration is per-result billed and
    // a profile does not change minute to minute.
    cooldownMs: 60 * 60_000,
  });
}

export async function enqueueSocialDiscover(userId: string, monitorId: string, reason: string) {
  return enqueueTask(userId, {
    kind: SOCIAL_TASK_KIND.discover,
    reason,
    ref: monitorId,
    payload: { monitorId } as Prisma.InputJsonValue,
  });
}

/** Turn due monitors into queue rows. The coordinator calls this from the
 *  existing seeding pass; it is bounded and idempotent (enqueueTask dedupes on
 *  the monitor ref while a run is still outstanding). */
export async function seedDueSocialMonitors(now: Date, limit = 200): Promise<number> {
  const due = await dueMonitors(now, limit);
  let seeded = 0;
  for (const monitor of due) {
    const { deduped } = await enqueueSocialDiscover(
      monitor.userId,
      monitor.id,
      `The "${monitor.name}" social watch is due. Anything it finds goes to your review queue, never straight into the CRM.`,
    );
    if (!deduped) seeded++;
  }
  return seeded;
}

/* --------------------------------------------------------------------------
 * Video transcripts
 * ----------------------------------------------------------------------- */

export interface TranscriptRequest {
  socqTaskId: string;
  endpoint: string;
  platform: SocialPlatform;
  videoUrl: string;
  replayed: boolean;
}

/**
 * Ask SocQ for a video transcript. This is the one capability here that takes
 * a URL from the caller, and it is safe precisely because it makes no identity
 * claim: a transcript is the content of a video, attached to nothing and
 * nobody. It never touches a Contact or an Entity.
 */
export async function requestSocialTranscript(
  userId: string,
  videoUrl: string,
): Promise<TranscriptRequest> {
  const classified = classifySocialUrl(videoUrl);
  if (!classified) {
    throw new OpError("That is not a recognised social video URL.", 400);
  }
  const candidates = TRANSCRIPT_ENDPOINTS[classified.platform as SocialPlatformKey];
  if (!candidates) {
    throw new OpError(
      `Transcription is available for YouTube, TikTok, Instagram and Facebook video only, not ${classified.platform}.`,
      400,
    );
  }
  const endpoint = await resolveEndpoint(candidates);
  const task = await submitTask(userId, {
    platform: endpoint.platform,
    resource: endpoint.resource,
    input: { urls: [classified.normalizedUrl] },
    purpose: `Transcribe a ${classified.platform} video`,
    resultsLimit: 1,
    resultsLimitCeiling: 1,
  });
  await enqueueSocqPoll(
    userId,
    {
      socqTaskId: task.socqTaskId,
      mode: "transcript",
      attempt: 0,
      platform: classified.platform,
      profileUrl: classified.normalizedUrl,
    },
    { reason: "Collect the video transcript that was requested, so it can be read without watching the video." },
  );
  return {
    socqTaskId: task.socqTaskId,
    endpoint: endpoint.publicId,
    platform: classified.platform,
    videoUrl: classified.normalizedUrl,
    replayed: task.replayed,
  };
}

/* --------------------------------------------------------------------------
 * Handlers
 * ----------------------------------------------------------------------- */

function readObject(payload: unknown): Record<string, unknown> {
  return payload == null || typeof payload !== "object" || Array.isArray(payload)
    ? {}
    : (payload as Record<string, unknown>);
}

const PLATFORMS = new Set<string>([
  "LINKEDIN", "X", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "REDDIT", "THREADS", "PINTEREST",
]);

function asPlatform(value: unknown): SocialPlatform | null {
  return typeof value === "string" && PLATFORMS.has(value) ? (value as SocialPlatform) : null;
}

/** social_hydrate: submit hydration for one record's verified URLs. */
export const socialHydrateHandler: TaskHandler = async (task) => {
  const bag = readObject(task.payload);
  if (!task.contactId && !task.entityId) {
    return { outcome: "skipped: task names no record to hydrate" };
  }
  const result = await hydrateRecordSocials(
    task.userId,
    { contactId: task.contactId, entityId: task.entityId },
    {
      includePosts: bag.includePosts !== false,
      ...(asPlatform(bag.platform) ? { platform: asPlatform(bag.platform) as SocialPlatform } : {}),
    },
  );
  return {
    outcome: `submitted ${result.submitted.length} social call(s), refused ${result.refused.length}`,
    payload: {
      submitted: result.submitted.map((s) => ({ socqTaskId: s.socqTaskId, endpoint: s.endpoint, mode: s.mode })),
      refused: result.refused,
    } as unknown as Prisma.InputJsonValue,
  };
};

/** social_discover: run one saved monitor. */
export const socialDiscoverHandler: TaskHandler = async (task, { now }) => {
  const bag = readObject(task.payload);
  const monitorId = typeof bag.monitorId === "string" ? bag.monitorId : typeof bag.ref === "string" ? bag.ref : null;
  if (!monitorId) return { outcome: "skipped: task has no monitor ref" };

  const monitor = await prisma.socialMonitor.findFirst({
    where: { id: monitorId, userId: task.userId },
    select: { id: true, active: true, nextRunAt: true, name: true },
  });
  if (!monitor || !monitor.active) return { outcome: "skipped: monitor is gone or paused" };
  // A retry of an already-advanced run must not spend a second time.
  if (monitor.nextRunAt && monitor.nextRunAt > now) {
    return { outcome: "skipped: already ran this cycle" };
  }

  const run = await runSocialMonitor(task.userId, monitorId, { now });
  return {
    outcome: `submitted ${run.endpoint} (limit ${run.resultsLimit})`,
    payload: { socqTaskId: run.socqTaskId, endpoint: run.endpoint } as Prisma.InputJsonValue,
  };
};

/** socq_poll: read a submitted task and write what came back. */
export const socqPollHandler: TaskHandler = async (task) => {
  const payload = readSocqPollPayload(task.payload);
  if (!payload) return { outcome: "skipped: task carries no readable SocQ poll payload" };

  const { items, result } = await collectTaskItems(task.userId, payload.socqTaskId);

  if (!result.done) {
    if (payload.attempt + 1 >= MAX_SOCQ_POLL_ATTEMPTS) {
      return { outcome: `gave up: SocQ task ${payload.socqTaskId} is still ${result.status.toLowerCase()}` };
    }
    await enqueueSocqPoll(
      task.userId,
      { ...payload, attempt: payload.attempt + 1 },
      {
        reason: task.reason,
        delaySeconds: result.pollAfterSeconds ?? DEFAULT_POLL_DELAY_SECONDS,
      },
    );
    return { outcome: `still ${result.status.toLowerCase()}, will look again` };
  }

  if (result.status === "FAILED") {
    return { outcome: `SocQ task failed: ${result.errorMessage ?? "no reason given"}` };
  }

  const platform = asPlatform(payload.platform);
  if (!platform) return { outcome: "skipped: poll payload names no platform" };

  switch (payload.mode) {
    case "profile": {
      if (!payload.profileUrl) return { outcome: "skipped: profile poll carries no verified URL" };
      const applied = await applyProfileItems(task.userId, {
        platform,
        profileUrl: payload.profileUrl,
        contactId: payload.contactId,
        entityId: payload.entityId,
        socqTaskId: payload.socqTaskId,
        items,
      });
      return {
        outcome: applied.written
          ? `hydrated the ${platform} profile (${result.creditsCharged} credits)`
          : "SocQ returned no profile for that URL",
      };
    }
    case "posts": {
      if (!payload.profileUrl) return { outcome: "skipped: posts poll carries no verified URL" };
      const applied = await applyPostItems(task.userId, {
        platform,
        profileUrl: payload.profileUrl,
        contactId: payload.contactId,
        entityId: payload.entityId,
        items,
      });
      return { outcome: `stored ${applied.written} post(s) (${result.creditsCharged} credits)` };
    }
    case "discover": {
      const applied = await applyDiscoveryItems(task.userId, {
        monitorId: payload.monitorId ?? null,
        platform,
        items,
      });
      return {
        outcome: `${applied.created} new opportunit${applied.created === 1 ? "y" : "ies"} to review, ${applied.duplicates} already seen (${result.creditsCharged} credits)`,
      };
    }
    case "transcript": {
      const written = await storeTranscript(task.userId, platform, payload.profileUrl ?? null, items);
      return { outcome: written ? `stored the transcript (${result.creditsCharged} credits)` : "no transcript came back" };
    }
    default:
      return { outcome: "skipped: unknown poll mode" };
  }
};

/** A transcript is stored as a SocialPost keyed on the video URL: it is post
 *  content, it belongs to nobody in particular, and keeping it there means the
 *  same dedupe and the same read path as everything else. */
async function storeTranscript(
  userId: string,
  platform: SocialPlatform,
  videoUrl: string | null,
  items: { url: string | null; text: string | null; publishedAt: Date | null; raw: Record<string, unknown> }[],
): Promise<boolean> {
  const item = items[0];
  const postUrl = videoUrl ?? item?.url ?? null;
  if (!item || !postUrl) return false;
  const data = {
    text: item.text,
    publishedAt: item.publishedAt,
    raw: (item.raw ?? {}) as Prisma.InputJsonValue,
  };
  await prisma.socialPost.upsert({
    where: { userId_postUrl: { userId, postUrl } },
    create: { userId, platform, postUrl, ...data },
    update: data,
  });
  return true;
}

/** Called once at dispatcher start-up by the coordinator, alongside
 *  registerCoreTaskHandlers(). Last registration wins, so a hot reload does
 *  not double-register. */
export function registerSocialTaskHandlers(): void {
  registerTaskHandler(SOCIAL_TASK_KIND.hydrate, socialHydrateHandler);
  registerTaskHandler(SOCIAL_TASK_KIND.discover, socialDiscoverHandler);
  registerTaskHandler(SOCIAL_TASK_KIND.poll, socqPollHandler);
}
