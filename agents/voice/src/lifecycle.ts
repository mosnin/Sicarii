// End of call lifecycle: decide the honest final status, push the transcript
// and the per model spend back into our own database, then hang up.
//
// WHY the transcript and modelUsage are persisted here rather than read off a
// dashboard later: session.history and session.modelUsage only exist inside
// this process. If the shutdown callback does not write them, the only record
// of what was said and what it cost lives in LiveKit's console, attributed to
// one account rather than to the tenant who owes for it. Cost per call per
// tenant is not a reporting nicety, it is the unit economics of the feature.
//
// Hanging up is deleting the room. There is no other lever: the SIP leg lives
// as a participant in the room, so the room going away is the call ending.

import { RoomServiceClient } from "livekit-server-sdk";
import type {
  CallDirection,
  CompleteCallInput,
  InternalApiClient,
  Logger,
  VoiceCallStatus,
} from "./tenant.js";

/** Everything we learn during a call that changes how it should be recorded. */
export interface CallState {
  /** Null only on a refused call, where the metadata never told us whose call this is. */
  tenantId: string | null;
  callId: string | null;
  roomName: string;
  direction: CallDirection;
  startedAt: Date;
  answeredAt: Date | null;
  /** True when the dial itself failed, which is never a conversation and must never be billed as one. */
  dialFailed: boolean;
  sipStatusCode: number | null;
  sipStatus: string | null;
  /** Answering machine detection said this was a machine, so this is a voicemail, not a talk. */
  reachedVoicemail: boolean;
  failureReason: string | null;
  systemPrompt: string | null;
  /** Set when we already know the terminal status, for example a refused call with unreadable metadata. */
  statusOverride: VoiceCallStatus | null;
}

export function createCallState(init: {
  tenantId: string | null;
  callId?: string | null;
  roomName: string;
  direction: CallDirection;
}): CallState {
  return {
    tenantId: init.tenantId,
    callId: init.callId ?? null,
    roomName: init.roomName,
    direction: init.direction,
    startedAt: new Date(),
    answeredAt: null,
    dialFailed: false,
    sipStatusCode: null,
    sipStatus: null,
    reachedVoicemail: false,
    failureReason: null,
    systemPrompt: null,
    statusOverride: null,
  };
}

/**
 * Map a SIP response code onto our VoiceCallStatus enum.
 *
 * The distinction that matters downstream is retry policy: BUSY and NO_ANSWER
 * are worth trying again later, FAILED usually is not, and none of the three
 * is a conversation. Codes are grouped by what they mean operationally rather
 * than by RFC class, because 408 and 480 mean the same thing to a sales rep.
 */
export function sipStatusToCallStatus(
  code: number | null | undefined,
  reason?: string | null,
): VoiceCallStatus {
  if (typeof code !== "number" || !Number.isFinite(code)) {
    // No SIP code at all on a failed dial means the failure happened before
    // any SIP response came back (network, auth, bad trunk). Not a busy line.
    return inferFromReason(reason) ?? "FAILED";
  }

  switch (code) {
    // Busy.
    case 486: // Busy Here
    case 600: // Busy Everywhere
      return "BUSY";

    // Rang, nobody picked up, or the far end gave up waiting.
    case 408: // Request Timeout
    case 480: // Temporarily Unavailable
    case 487: // Request Terminated, which is what a ringing timeout cancel looks like
    case 504: // Server Time out
      return "NO_ANSWER";

    // Explicitly refused, unroutable, or blocked. Retrying will not help.
    case 401:
    case 403: // Forbidden
    case 404: // Not Found, a dead number
    case 407:
    case 410: // Gone
    case 484: // Address Incomplete
    case 485: // Ambiguous
    case 488: // Not Acceptable Here
    case 502:
    case 503: // Service Unavailable
    case 603: // Decline
    case 604: // Does Not Exist Anywhere
    case 606: // Not Acceptable
      return "FAILED";

    default:
      break;
  }

  // 2xx means answered. Anything else on a failed dial is a failure.
  if (code >= 200 && code < 300) return "ANSWERED";
  return "FAILED";
}

function inferFromReason(reason?: string | null): VoiceCallStatus | null {
  const text = reason?.toLowerCase() ?? "";
  if (!text) return null;
  if (text.includes("busy")) return "BUSY";
  if (text.includes("no answer") || text.includes("timeout") || text.includes("unavailable")) {
    return "NO_ANSWER";
  }
  return null;
}

/**
 * The one honest terminal status for a call. Never returns QUEUED or RINGING:
 * those are in flight states, and a call that has reached shutdown is not in
 * flight, whatever went wrong.
 */
export function finalCallStatus(state: CallState): VoiceCallStatus {
  if (state.statusOverride) return state.statusOverride;
  if (state.dialFailed) {
    const mapped = sipStatusToCallStatus(state.sipStatusCode, state.sipStatus);
    // A dial that failed cannot come out the other side as ANSWERED.
    return mapped === "ANSWERED" ? "FAILED" : mapped;
  }
  if (state.reachedVoicemail) return "VOICEMAIL";
  // Once the far end picked up, a conversation happened. A later error is worth
  // recording in the error field, but it does not un-answer the phone.
  if (state.answeredAt) return "COMPLETED";
  return "FAILED";
}

export function durationSeconds(state: CallState, endedAt: Date): number | null {
  const from = state.answeredAt ?? null;
  if (!from) return null;
  const seconds = Math.round((endedAt.getTime() - from.getTime()) / 1000);
  return seconds >= 0 ? seconds : 0;
}

/** ChatContext carries its own serializer in agents 1.x; fall back to the raw value. */
export function serializeHistory(history: unknown): unknown {
  if (history === null || history === undefined) return null;
  const candidate = history as { toJSON?: () => unknown };
  if (typeof candidate.toJSON === "function") {
    try {
      return candidate.toJSON();
    } catch {
      return null;
    }
  }
  return history;
}

/** Minimal structural view of an AgentSession, so this module stays testable without booting one. */
export interface SessionLike {
  history?: unknown;
  modelUsage?: unknown;
}

export interface ShutdownDeps {
  api: InternalApiClient;
  state: CallState;
  logger: Logger;
  session?: SessionLike | null;
  roomService?: RoomServiceLike | null;
}

export interface RoomServiceLike {
  deleteRoom: (room: string) => Promise<void>;
}

export function createRoomService(config: {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
}): RoomServiceLike {
  // RoomServiceClient wants an https origin; the worker is configured with the
  // wss one, and they are the same host.
  const httpUrl = config.livekitUrl.replace(/^ws/, "http");
  return new RoomServiceClient(httpUrl, config.livekitApiKey, config.livekitApiSecret);
}

/**
 * Persist the call, then hang up. Never throws: this runs inside LiveKit's
 * shutdown callback, and a throw there loses the room deletion, which leaves a
 * paid SIP leg open.
 */
export async function finalizeCall(deps: ShutdownDeps): Promise<CompleteCallInput> {
  const { api, state, logger, session, roomService } = deps;
  const endedAt = new Date();
  const status = finalCallStatus(state);

  const payload: CompleteCallInput = {
    tenantId: state.tenantId,
    callId: state.callId,
    roomName: state.roomName,
    status,
    sipStatusCode: state.sipStatusCode,
    sipStatus: state.sipStatus,
    startedAt: state.startedAt.toISOString(),
    answeredAt: state.answeredAt?.toISOString() ?? null,
    endedAt: endedAt.toISOString(),
    durationSeconds: durationSeconds(state, endedAt),
    // A failed dial has no conversation. Sending an empty transcript is more
    // honest than sending the greeting we never got to say.
    transcript: state.dialFailed ? null : serializeHistory(session?.history),
    modelUsage: session?.modelUsage ?? null,
    systemPrompt: state.systemPrompt,
    error: state.failureReason,
  };

  try {
    await api.completeCall(payload);
  } catch (error) {
    logger.error("failed to persist call result", {
      roomName: state.roomName,
      status,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (roomService) {
    try {
      await roomService.deleteRoom(state.roomName);
    } catch (error) {
      // The room may already be gone because the caller hung up first. That is
      // the normal path, not an incident.
      logger.info("room delete on hangup did not apply", {
        roomName: state.roomName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return payload;
}
