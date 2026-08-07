// Every provider and model choice is read from the environment rather than
// written into the code, because changing a voice or an LLM must be a config
// change on a running deployment, not a code release and a redeploy of a
// worker that is currently holding live phone calls.
//
// Nothing here is read at import time. The config is resolved lazily so the
// pure modules (metadata parsing, prompt building, status mapping) stay
// importable in tests without a fully populated environment.

export type SttProvider = "deepgram" | "openai" | "google";
export type LlmProvider = "openai" | "google";
export type TtsProvider = "cartesia" | "elevenlabs" | "openai" | "google";

export interface VoiceAgentConfig {
  /** Explicit dispatch name. One name serves every tenant; tenancy comes from job metadata. */
  agentName: string;

  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;

  /** Base URL of the Next.js app that owns the database. The worker has no DATABASE_URL. */
  internalApiUrl: string;
  internalSecret: string;
  internalTimeoutMs: number;

  /** Default outbound SIP trunk. Per call metadata may override it, since trunks are per tenant DID. */
  outboundTrunkId: string | null;

  stt: { provider: SttProvider; model: string; language: string };
  llm: { provider: LlmProvider; model: string; temperature: number };
  tts: { provider: TtsProvider; model: string; voice: string };

  maxCallDurationSeconds: number;
  ringingTimeoutSeconds: number;
  krispEnabled: boolean;

  /** Recording redaction is the PII lever on call recordings. On by default; opting out is deliberate. */
  recordingRedaction: boolean;
  recordAudio: boolean;
  recordTranscript: boolean;
  recordTraces: boolean;
}

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingEnvError";
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim() === "") throw new MissingEnvError(name);
  return value.trim();
}

function optional(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name];
  return value && value.trim() !== "" ? value.trim() : null;
}

function str(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  return optional(env, name) ?? fallback;
}

function num(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = optional(env, name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = optional(env, name);
  if (raw === null) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function oneOf<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = optional(env, name)?.toLowerCase();
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

/**
 * Resolve the worker config. Throws MissingEnvError for anything the worker
 * genuinely cannot run without, so a misconfigured deployment dies at boot
 * instead of answering a real phone call and failing halfway through it.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): VoiceAgentConfig {
  return {
    agentName: str(env, "VOICE_AGENT_NAME", "scalar-agent"),

    livekitUrl: required(env, "LIVEKIT_URL"),
    livekitApiKey: required(env, "LIVEKIT_API_KEY"),
    livekitApiSecret: required(env, "LIVEKIT_API_SECRET"),

    internalApiUrl: required(env, "SCALAR_INTERNAL_API_URL").replace(/\/+$/, ""),
    internalSecret: required(env, "SCALAR_INTERNAL_SECRET"),
    internalTimeoutMs: num(env, "SCALAR_INTERNAL_TIMEOUT_MS", 10_000),

    outboundTrunkId: optional(env, "LIVEKIT_SIP_OUTBOUND_TRUNK_ID"),

    stt: {
      provider: oneOf(env, "VOICE_STT_PROVIDER", ["deepgram", "openai", "google"] as const, "deepgram"),
      model: str(env, "VOICE_STT_MODEL", "nova-3"),
      language: str(env, "VOICE_STT_LANGUAGE", "en-US"),
    },
    llm: {
      provider: oneOf(env, "VOICE_LLM_PROVIDER", ["openai", "google"] as const, "openai"),
      model: str(env, "VOICE_LLM_MODEL", "gpt-4o-mini"),
      temperature: num(env, "VOICE_LLM_TEMPERATURE", 0.3),
    },
    tts: {
      provider: oneOf(
        env,
        "VOICE_TTS_PROVIDER",
        ["cartesia", "elevenlabs", "openai", "google"] as const,
        "cartesia",
      ),
      model: str(env, "VOICE_TTS_MODEL", "sonic-2"),
      voice: str(env, "VOICE_TTS_VOICE", "794f9389-aac1-45b6-b726-9d9369183238"),
    },

    maxCallDurationSeconds: num(env, "VOICE_MAX_CALL_DURATION_SEC", 600),
    ringingTimeoutSeconds: num(env, "VOICE_RINGING_TIMEOUT_SEC", 30),
    krispEnabled: bool(env, "VOICE_KRISP_ENABLED", true),

    recordingRedaction: bool(env, "VOICE_RECORDING_REDACTION", true),
    recordAudio: bool(env, "VOICE_RECORD_AUDIO", true),
    recordTranscript: bool(env, "VOICE_RECORD_TRANSCRIPT", true),
    recordTraces: bool(env, "VOICE_RECORD_TRACES", true),
  };
}
