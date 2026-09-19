// Jev HTTP client. Transport order (tumf/jev-cli + notra + FFatTiger):
//   1. Native TypeSafe POST /v1/systemone
//   2. Vercel AI Gateway evaluate (typesafe-ai/jev)
//   3. Optional OpenRouter typesafe/jev-1.13 as an eval fallback
// Qwen is NEVER used for evaluate(). Retry only 429/529. Caller owns
// fail-open vs fail-closed.

import {
  compactState,
  JevError,
  validateAnswers,
  validateQuestions,
  type Answer,
  type FailureMode,
  type JevProvider,
  type JevResult,
  type Json,
  type QuestionMap,
} from "./contract";
import { CLIENT_DEFAULTS, JEV_MODEL } from "./policy";
import {
  evaluateCacheKey,
  isJevCircuitOpen,
  readEvaluateCache,
  recordJevFailure,
  recordJevSuccess,
  writeEvaluateCache,
} from "./runtime";

export type JevEvaluateRequest<Q extends QuestionMap = QuestionMap> = {
  state: Json;
  questions: Q;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  zdr?: boolean;
  onFailure?: FailureMode;
};

export type JevClient = {
  evaluate<Q extends QuestionMap>(req: JevEvaluateRequest<Q>): Promise<JevResult<Q>>;
};

export type JevClientConfig = {
  typesafeKey?: string;
  typesafeBaseUrl?: string;
  gatewayKey?: string;
  gatewayBaseUrl?: string;
  openrouterKey?: string;
  openrouterJevModel?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
};

type RawAnswer = {
  type?: string;
  noul?: number;
  probability?: number;
  choice?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
};

function envConfig(): JevClientConfig {
  return {
    typesafeKey: process.env.TYPESAFE_API_KEY?.trim() || process.env.TYPESAFE_AI_API_KEY?.trim(),
    typesafeBaseUrl: process.env.TYPESAFE_BASE_URL?.trim() || "https://api.typesafe.ai/v1",
    gatewayKey: process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_AI_GATEWAY_API_KEY?.trim(),
    gatewayBaseUrl: process.env.AI_GATEWAY_BASE_URL?.trim() || "https://ai-gateway.vercel.sh/v1",
    openrouterKey: process.env.OPENROUTER_API_KEY?.trim(),
    openrouterJevModel: process.env.OPENROUTER_JEV_MODEL?.trim() || "typesafe/jev-1.13",
    timeoutMs: CLIENT_DEFAULTS.timeoutMs,
    maxRetries: CLIENT_DEFAULTS.maxRetries,
  };
}

export function isJevConfigured(cfg: JevClientConfig = envConfig()): boolean {
  return Boolean(cfg.typesafeKey || cfg.gatewayKey || cfg.openrouterKey);
}

/** Production opt-in: when set, missing Jev keys fail closed on writes,
 *  money, memory, and inbound scans instead of silently allowing. */
export function isJevRequired(): boolean {
  const v = process.env.JEV_REQUIRED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function normalizeAnswer(raw: RawAnswer): Answer {
  const looksNoul =
    raw.type === "noul" ||
    raw.type === "boolean" ||
    ((raw.noul != null || raw.probability != null) && raw.choice == null && raw.score == null);
  if (looksNoul) {
    const p = typeof raw.noul === "number" ? raw.noul : typeof raw.probability === "number" ? raw.probability : 0.5;
    return { type: "noul", noul: p };
  }
  if (raw.type === "score" || raw.score != null) {
    return {
      type: "score",
      score: typeof raw.score === "number" ? raw.score : 0,
      legend: raw.legend ?? {},
      probabilities: raw.probabilities ?? {},
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
    };
  }
  return {
    type: "choice",
    choice: typeof raw.choice === "string" ? raw.choice : "other",
    probabilities: raw.probabilities ?? {},
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
  };
}

function normalizeAnswers(raw: Record<string, RawAnswer>): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = normalizeAnswer(v ?? {});
  return out;
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    const aborted = ctrl.signal.aborted;
    throw new JevError(aborted ? "Jev request timed out." : "Jev request failed.", {
      retryable: aborted,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function usageOf(json: Record<string, unknown>): { inputTokens: number; outputTokens: number } {
  const usage = (json.usage ?? {}) as Record<string, unknown>;
  const input =
    (typeof usage.input_tokens === "number" && usage.input_tokens) ||
    (typeof usage.prompt_tokens === "number" && usage.prompt_tokens) ||
    0;
  const output =
    (typeof usage.output_tokens === "number" && usage.output_tokens) ||
    (typeof usage.completion_tokens === "number" && usage.completion_tokens) ||
    0;
  return { inputTokens: input, outputTokens: output };
}

export function createJevClient(config: JevClientConfig = {}): JevClient {
  const cfg = { ...envConfig(), ...config };
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? CLIENT_DEFAULTS.timeoutMs;
  const maxRetries = cfg.maxRetries ?? CLIENT_DEFAULTS.maxRetries;

  async function evaluateOnce<Q extends QuestionMap>(
    req: JevEvaluateRequest<Q>,
  ): Promise<JevResult<Q>> {
    validateQuestions(req.questions);
    const state = compactState(req.state, CLIENT_DEFAULTS.maxStateChars);
    const model = req.model ?? JEV_MODEL;
    const started = Date.now();

    const attempts: Array<{
      provider: JevProvider;
      run: () => Promise<{ status: number; json: unknown }>;
    }> = [];

    if (cfg.typesafeKey) {
      attempts.push({
        provider: "typesafe",
        run: () =>
          postJson(
            fetchImpl,
            `${(cfg.typesafeBaseUrl ?? "https://api.typesafe.ai/v1").replace(/\/$/, "")}/systemone`,
            { authorization: `Bearer ${cfg.typesafeKey}` },
            { model, state, questions: req.questions },
            req.timeoutMs ?? timeoutMs,
            req.signal,
          ),
      });
    }

    if (cfg.gatewayKey) {
      attempts.push({
        provider: "gateway",
        run: () =>
          postJson(
            fetchImpl,
            `${(cfg.gatewayBaseUrl ?? "https://ai-gateway.vercel.sh/v1").replace(/\/$/, "")}/evaluate`,
            { authorization: `Bearer ${cfg.gatewayKey}` },
            {
              model: "typesafe-ai/jev",
              state,
              questions: req.questions,
              providerOptions: req.zdr ? { gateway: { zeroDataRetention: true } } : undefined,
            },
            req.timeoutMs ?? timeoutMs,
            req.signal,
          ),
      });
    }

    if (cfg.openrouterKey) {
      attempts.push({
        provider: "openrouter-jev",
        run: () =>
          postJson(
            fetchImpl,
            "https://openrouter.ai/api/v1/systemone",
            {
              authorization: `Bearer ${cfg.openrouterKey}`,
              "http-referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://www.tryscalar.xyz",
              "x-title": "Scalar",
            },
            { model: cfg.openrouterJevModel ?? "typesafe/jev-1.13", state, questions: req.questions },
            req.timeoutMs ?? timeoutMs,
            req.signal,
          ),
      });
    }

    if (attempts.length === 0) {
      throw new JevError("Jev is not configured. Set TYPESAFE_API_KEY, AI_GATEWAY_API_KEY, or OPENROUTER_API_KEY.");
    }

    const retries = req.maxRetries ?? maxRetries;
    let lastError: JevError | null = null;
    for (const attempt of attempts) {
      for (let i = 0; i <= retries; i++) {
        try {
          const { status, json } = await attempt.run();
          if (status === 429 || status === 529) {
            lastError = new JevError(`Jev ${attempt.provider} overloaded (${status}).`, {
              status,
              retryable: true,
            });
            await new Promise((r) => setTimeout(r, 200 * 2 ** i));
            continue;
          }
          if (status === 401) {
            lastError = new JevError(`Jev ${attempt.provider} rejected the API key.`, {
              status,
              retryable: false,
            });
            break;
          }
          if (status >= 400) {
            lastError = new JevError(`Jev ${attempt.provider} returned ${status}.`, {
              status,
              retryable: status >= 500,
            });
            if (status >= 500) {
              await new Promise((r) => setTimeout(r, 200 * 2 ** i));
              continue;
            }
            break;
          }
          const body = (json ?? {}) as Record<string, unknown>;
          const rawAnswers = (body.answers ?? {}) as Record<string, RawAnswer>;
          const answers = normalizeAnswers(rawAnswers);
          validateAnswers(req.questions, answers);
          return {
            model: typeof body.model === "string" ? body.model : model,
            answers: answers as JevResult<Q>["answers"],
            usage: usageOf(body),
            latencyMs: Date.now() - started,
            provider: attempt.provider,
          };
        } catch (e) {
          lastError = e instanceof JevError ? e : new JevError("Jev request failed.", { retryable: true });
          if (!lastError.retryable) break;
          await new Promise((r) => setTimeout(r, 200 * 2 ** i));
        }
      }
    }
    throw lastError ?? new JevError("Jev request failed.");
  }

  return { evaluate: evaluateOnce };
}

let defaultClient: JevClient | null = null;

export function getJevClient(): JevClient {
  if (!defaultClient) defaultClient = createJevClient();
  return defaultClient;
}

export function resetJevClient(): void {
  defaultClient = null;
}

/** Evaluate with caller-owned failure mode. fail-open returns null. */
export async function tryEvaluate<Q extends QuestionMap>(
  req: JevEvaluateRequest<Q>,
  client?: JevClient,
): Promise<JevResult<Q> | null> {
  if (!client && !isJevConfigured()) return null;
  const useRuntime = !client;
  if (useRuntime && isJevCircuitOpen()) {
    if (req.onFailure === "fail-closed") {
      throw new JevError("Jev circuit open.", { retryable: true });
    }
    return null;
  }
  const cacheKey = useRuntime ? evaluateCacheKey(req.state, req.questions) : null;
  if (cacheKey) {
    const hit = readEvaluateCache(cacheKey);
    if (hit) return hit as JevResult<Q>;
  }
  const resolved = client ?? getJevClient();
  try {
    const result = await resolved.evaluate(req);
    if (useRuntime) {
      recordJevSuccess();
      if (cacheKey) writeEvaluateCache(cacheKey, result);
    }
    return result;
  } catch (e) {
    if (useRuntime) recordJevFailure();
    if (req.onFailure === "fail-closed") throw e;
    console.warn("[jev] evaluate failed open", e instanceof Error ? e.message : e);
    return null;
  }
}
