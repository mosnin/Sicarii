// The Scalar voice agent worker.
//
// ONE deployment serves EVERY tenant. There is exactly one agentName, and
// tenancy arrives per job in ctx.job.metadata. A tenant is never baked into a
// deployment, because the moment it is, onboarding a customer means shipping
// infrastructure.
//
// Inbound and outbound share this entry. The control plane JSON encodes the
// same payload either way: inbound through the SIP dispatch rule's
// roomConfig.agents[].metadata, outbound through AgentDispatchClient. The only
// difference below is that an outbound job places the SIP call itself, after
// it has been dispatched into the room, never before.

import { fileURLToPath } from "node:url";

import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from "@livekit/agents";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as google from "@livekit/agents-plugin-google";
import * as livekitTurn from "@livekit/agents-plugin-livekit";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { SipCallError, SipClient } from "livekit-server-sdk";

import { type VoiceAgentConfig, loadConfig } from "./config.js";
import {
  type CallState,
  type SessionLike,
  createCallState,
  createRoomService,
  finalizeCall,
} from "./lifecycle.js";
import { createLogger } from "./logger.js";
import {
  FAILSAFE_LINE,
  type PromptInput,
  buildOpeningLine,
  buildSystemPrompt,
  buildVoicemailLine,
} from "./prompt.js";
import { buildTools } from "./tools.js";
import { InternalApiClient, type SessionContext, parseJobMetadata } from "./tenant.js";

/** Stable identity for the phone leg, so AMD and any later transfer can address it. */
const SIP_PARTICIPANT_IDENTITY = "phone";

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Silero is a native model load. Doing it per job would put roughly a
    // second of cold start in front of the first word of every call.
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const config = loadConfig();
    const jobRoomName = ctx.job.room?.name ?? "";
    const logger = createLogger({ room: jobRoomName, jobId: ctx.job.id });

    const api = new InternalApiClient({
      baseUrl: config.internalApiUrl,
      secret: config.internalSecret,
      timeoutMs: config.internalTimeoutMs,
      logger,
    });
    const roomService = createRoomService(config);

    const parsed = parseJobMetadata(ctx.job.metadata);

    // A payload we cannot read means we do not know whose data we would be
    // speaking, whose credits we would be spending, or who consented to a
    // recording. There is no safe default tenant, so the call is refused.
    if (!parsed.ok) {
      logger.error("refusing call: unusable job metadata", { reason: parsed.reason });
      const state = createCallState({
        tenantId: null,
        roomName: jobRoomName,
        direction: "INBOUND",
      });
      state.statusOverride = "FAILED";
      state.failureReason = parsed.reason;

      ctx.addShutdownCallback(async () => {
        await finalizeCall({ api, state, logger, session: null, roomService });
      });

      await refuseCall(ctx, config, state, logger);
      return;
    }

    const meta = parsed.metadata;
    const state = createCallState({
      tenantId: meta.tenantId,
      callId: meta.callId,
      roomName: jobRoomName,
      direction: meta.direction,
    });

    // A holder rather than a value: the shutdown callback is registered before
    // the session exists, because the window where a job can die without one
    // is exactly the window where losing the record hurts most.
    const holder: { session: SessionLike | null } = { session: null };
    ctx.addShutdownCallback(async () => {
      await finalizeCall({ api, state, logger, session: holder.session, roomService });
    });

    let context: SessionContext;
    try {
      context = await api.startSession({
        tenantId: meta.tenantId,
        callId: meta.callId,
        roomName: jobRoomName,
        direction: meta.direction,
        phoneNumber: meta.phoneNumber,
        fromNumber: meta.fromNumber,
        crmContactId: meta.crmContactId,
        purpose: meta.purpose,
        agentName: config.agentName,
      });
    } catch (error) {
      state.statusOverride = "FAILED";
      state.failureReason = `tenant resolution failed: ${describe(error)}`;
      logger.error("refusing call: tenant resolution failed", { error: describe(error) });
      await refuseCall(ctx, config, state, logger);
      return;
    }

    state.callId = context.callId;

    if (!context.tenant.voiceEnabled) {
      state.statusOverride = "FAILED";
      state.failureReason = "voice is not enabled for this tenant";
      logger.warn("refusing call: voice disabled for tenant", { tenantId: meta.tenantId });
      await refuseCall(ctx, config, state, logger);
      return;
    }

    const promptInput: PromptInput = {
      tenant: context.tenant,
      contact: context.contact,
      recentHistory: context.recentHistory,
      direction: meta.direction,
      purpose: meta.purpose,
      operatorPrompt: meta.systemPrompt,
    };
    const instructions = buildSystemPrompt(promptInput);
    state.systemPrompt = instructions;

    const tools = buildTools({
      api,
      state,
      tenantId: meta.tenantId,
      logger,
      peerPhoneNumber: meta.phoneNumber ?? null,
      currentContactId: context.contact?.id ?? null,
    });

    await ctx.connect();
    state.roomName = ctx.room.name || jobRoomName;

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: buildStt(config),
      llm: buildLlm(config),
      tts: buildTts(config, context.tenant.ttsVoice ?? undefined),
      // Semantic end of turn beats a silence timer on the phone, where people
      // pause mid sentence and a timer talks over them.
      turnDetection: new livekitTurn.MultilingualModel(),
    });
    holder.session = session as unknown as SessionLike;

    await session.start({
      agent: new voice.Agent({ instructions, tools }),
      room: ctx.room,
      record: {
        audio: config.recordAudio,
        transcript: config.recordTranscript,
        traces: config.recordTraces,
        // Redaction is the PII lever on stored call audio. Turning it off is a
        // deliberate per deployment decision, never a default.
        redaction: config.recordingRedaction,
      },
    });

    if (meta.direction === "OUTBOUND") {
      const dialed = await placeOutboundCall({ ctx, config, meta, state, logger, api, context });
      if (!dialed) return;

      // Talking to a machine and talking to a person are different outcomes and
      // are recorded differently. Leaving a pitch on a voicemail is also a
      // waste of everyone's money.
      const category = await detectAnsweringMachine(session, logger);
      if (category === voice.AMDCategory.MACHINE_VM) {
        state.reachedVoicemail = true;
        logger.info("voicemail detected, leaving a short message");
        await sayAndWait(session, buildVoicemailLine(promptInput));
        return;
      }

      await sayAndWait(session, buildOpeningLine(promptInput));
      return;
    }

    // Inbound: the caller is already on the line the moment we are dispatched.
    state.answeredAt = new Date();
    await reportStatus(api, state, "ANSWERED", logger);
    await sayAndWait(session, buildOpeningLine(promptInput));
  },
});

// ── Outbound dialling ───────────────────────────────────────────────────────

async function placeOutboundCall(args: {
  ctx: JobContext;
  config: VoiceAgentConfig;
  meta: { phoneNumber?: string | null; fromNumber: string; trunkId?: string | null; maxCallDurationSeconds?: number | null };
  state: CallState;
  logger: ReturnType<typeof createLogger>;
  api: InternalApiClient;
  context: SessionContext;
}): Promise<boolean> {
  const { config, meta, state, logger, api, context } = args;

  const trunkId = meta.trunkId ?? config.outboundTrunkId;
  if (!trunkId) {
    state.dialFailed = true;
    state.failureReason = "no outbound SIP trunk configured for this tenant";
    logger.error("outbound dial impossible: no trunk");
    return false;
  }
  if (!meta.phoneNumber) {
    state.dialFailed = true;
    state.failureReason = "no phone number supplied for an outbound call";
    return false;
  }

  const sip = new SipClient(
    config.livekitUrl.replace(/^ws/, "http"),
    config.livekitApiKey,
    config.livekitApiSecret,
  );

  await reportStatus(api, state, "RINGING", logger);

  try {
    await sip.createSipParticipant(trunkId, meta.phoneNumber, state.roomName, {
      participantIdentity: SIP_PARTICIPANT_IDENTITY,
      participantName: context.contact?.name ?? undefined,
      fromNumber: meta.fromNumber,
      // Blocks until the far end picks up, so the greeting is never played into
      // a ringing line.
      waitUntilAnswered: true,
      maxCallDuration: meta.maxCallDurationSeconds ?? config.maxCallDurationSeconds,
      ringingTimeout: config.ringingTimeoutSeconds,
      krispEnabled: config.krispEnabled,
    });
  } catch (error) {
    // A failed dial is a busy signal, a dead number or a rejection. It is never
    // a conversation, and must never be recorded or billed as one.
    state.dialFailed = true;
    const sipError = asSipCallError(error);
    state.sipStatusCode = sipError?.sipStatusCode ?? null;
    state.sipStatus = sipError?.sipStatus ?? null;
    state.failureReason = describe(error);
    logger.warn("outbound dial failed", {
      sipStatusCode: state.sipStatusCode,
      sipStatus: state.sipStatus,
      error: describe(error),
    });
    return false;
  }

  state.answeredAt = new Date();
  await reportStatus(api, state, "ANSWERED", logger);
  return true;
}

/** SipCallError carries sip_status_code and sip_status in the Twirp error metadata. */
function asSipCallError(error: unknown): SipCallError | null {
  return error instanceof SipCallError ? error : null;
}

async function detectAnsweringMachine(
  session: voice.AgentSession,
  logger: ReturnType<typeof createLogger>,
): Promise<voice.AMDCategory | null> {
  try {
    const detector = new voice.AMD(session, { participantIdentity: SIP_PARTICIPANT_IDENTITY });
    const result = await detector.execute();
    logger.info("answering machine detection finished", { category: result.category });
    return result.category;
  } catch (error) {
    // A detector failure must not drop the call. Treating an undetected call as
    // a human is the safe error: worst case we greet a voicemail.
    logger.warn("answering machine detection failed", { error: describe(error) });
    return null;
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Speak the failsafe line, but only if there is actually someone on the line.
 * On a refused outbound job nothing was dialled, so there is nobody to
 * apologise to and speaking would only cost TTS.
 */
async function refuseCall(
  ctx: JobContext,
  config: VoiceAgentConfig,
  state: CallState,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    await ctx.connect();
    state.roomName = ctx.room.name || state.roomName;
    if (ctx.room.remoteParticipants.size === 0) return;

    const session = new voice.AgentSession({ tts: buildTts(config) });
    await session.start({
      agent: new voice.Agent({ instructions: FAILSAFE_LINE }),
      room: ctx.room,
      // No recording here on purpose: we could not identify the tenant, so
      // there is no consent basis and no owner for the audio.
    });
    await sayAndWait(session, FAILSAFE_LINE);
  } catch (error) {
    logger.warn("could not speak the failsafe line", { error: describe(error) });
  }
}

/** session.say resolves when the utterance is queued; the handle resolves when it has been heard. */
async function sayAndWait(session: voice.AgentSession, text: string): Promise<void> {
  const handle = (await session.say(text)) as unknown as {
    waitForPlayout?: () => Promise<unknown>;
  } | null;
  if (handle && typeof handle.waitForPlayout === "function") {
    await handle.waitForPlayout();
  }
}

async function reportStatus(
  api: InternalApiClient,
  state: CallState,
  status: "RINGING" | "ANSWERED",
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    await api.reportStatus({
      tenantId: state.tenantId,
      callId: state.callId,
      roomName: state.roomName,
      status,
      startedAt: state.startedAt.toISOString(),
      answeredAt: state.answeredAt?.toISOString() ?? null,
    });
  } catch (error) {
    // An in flight status is a nicety for the live call list. The shutdown
    // callback writes the record that matters, so never fail a call over this.
    logger.warn("could not report in flight status", { status, error: describe(error) });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

// ── Provider construction ───────────────────────────────────────────────────
// Provider and model are env driven so that changing a voice or an LLM is a
// config change on the deployment, not a code release.

function buildStt(config: VoiceAgentConfig) {
  switch (config.stt.provider) {
    case "openai":
      return new openai.STT({ model: config.stt.model, language: config.stt.language });
    case "google":
      return new google.STT({ model: config.stt.model });
    case "deepgram":
    default:
      return new deepgram.STT({ model: config.stt.model, language: config.stt.language });
  }
}

function buildLlm(config: VoiceAgentConfig) {
  switch (config.llm.provider) {
    case "google":
      return new google.LLM({ model: config.llm.model, temperature: config.llm.temperature });
    case "openai":
    default:
      return new openai.LLM({ model: config.llm.model, temperature: config.llm.temperature });
  }
}

function buildTts(config: VoiceAgentConfig, voiceOverride?: string) {
  const voiceId = voiceOverride ?? config.tts.voice;
  switch (config.tts.provider) {
    case "elevenlabs":
      return new elevenlabs.TTS({ modelID: config.tts.model, voice: voiceId });
    case "openai":
      return new openai.TTS({ model: config.tts.model, voice: voiceId });
    case "google":
      return new google.TTS({ voice: voiceId });
    case "cartesia":
    default:
      return new cartesia.TTS({ model: config.tts.model, voice: voiceId });
  }
}

// Explicit dispatch. Without agentName, jobs are auto dispatched to every room
// and multi tenant routing is impossible: the dispatch rule and the outbound
// dispatch both name this agent and hand it the tenant in metadata.
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.VOICE_AGENT_NAME ?? "scalar-agent",
  }),
);
