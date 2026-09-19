// Qwen via OpenRouter. Called ONLY after Jev grants generation
// (needsGeneration yes and tier != none). Never classifies, never picks tools.

import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type QwenEffort = "low" | "medium" | "high";
export type GenerationTier = "qwen_fast" | "qwen_strong" | "openai_fallback";

export const QWEN_FAST_MODEL = process.env.OPENROUTER_QWEN_FAST_MODEL?.trim() || "qwen/qwen3-32b";
export const QWEN_STRONG_MODEL =
  process.env.OPENROUTER_QWEN_STRONG_MODEL?.trim() || "qwen/qwen3-235b-a22b";
export const OPENAI_AGENT_MODEL = process.env.OPENAI_AGENT_MODEL?.trim() || "gpt-4o";

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function isGenerationConfigured(): boolean {
  return isOpenRouterConfigured() || isOpenAIConfigured();
}

function openrouterProvider() {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;
  return createOpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://www.tryscalar.xyz",
      "X-Title": "Scalar",
    },
  });
}

export function resolveGenerationModel(opts?: {
  prefer?: "qwen" | "openai";
  effort?: QwenEffort;
  tier?: "none" | "qwen_fast" | "qwen_strong";
}): { model: LanguageModel; provider: "openrouter-qwen" | "openai"; id: string } | null {
  const wantQwen = opts?.prefer !== "openai" && (opts?.tier !== "none" || opts?.prefer === "qwen");
  const or = openrouterProvider();
  if (wantQwen && or) {
    const strong = opts?.tier === "qwen_strong" || opts?.effort === "high";
    const id = strong ? QWEN_STRONG_MODEL : QWEN_FAST_MODEL;
    return { model: or(id), provider: "openrouter-qwen", id };
  }
  if (isOpenAIConfigured()) {
    return { model: openai(OPENAI_AGENT_MODEL), provider: "openai", id: OPENAI_AGENT_MODEL };
  }
  if (or) {
    return { model: or(QWEN_FAST_MODEL), provider: "openrouter-qwen", id: QWEN_FAST_MODEL };
  }
  return null;
}

export function generationUnavailableMessage(): string {
  return "The agent isn't configured yet. Add OPENROUTER_API_KEY (Qwen) or OPENAI_API_KEY.";
}
