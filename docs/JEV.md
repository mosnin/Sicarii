# Jev in Scalar

Scalar's decision plane is Jev (TypeSafe System One). Generation is Qwen via
OpenRouter. Voice in and out is OpenAI. Jev never writes prose.

## Why

An agent loop that asks a chat model to classify, route, score, and then also
write is slow and expensive. Jev evaluates shared state against typed questions
and returns calibrated probabilities in one parallel call (typically 70-500ms).
Code owns the branch. Qwen writes only after Jev says generation is required.

This matches the LangChain harness: **model router** (pick a cheap vs capable
generator, pin it for the turn) and **auto mode** (inspect a pending tool call
and block it before execute).

## Primitives

| Type | Meaning | Returns |
|------|---------|---------|
| `noul` | yes/no | `noul` in [0, 1]. 0.5 is "can't tell" |
| `choice` | pick one (2-255, always include `other`/`none`) | `choice`, `probabilities`, `confidence` |
| `score` | ordered situation levels (2-10) | fractional `score`, `legend`, `probabilities`, `confidence` |

Transport order: native `POST https://api.typesafe.ai/v1/systemone` → Vercel
AI Gateway `evaluate` → optional OpenRouter `typesafe/jev-1.13`. Qwen is never
used for evaluate.

## Where it sits

| Surface | Jev job | Generator |
|---------|---------|-----------|
| `/api/agent` | Turn decide + model router + auto-mode tool gate | Qwen (OpenRouter) or OpenAI fallback |
| `/api/discover/route-intent` | Choice over the discovery catalog | heuristic params |
| `/api/crm/fit-score` | Score per record vs product context | none |
| `/api/crm/semantic-sort` | Noul per record vs intent | none |
| Voice webhook + `/api/voice/*` | Choice over spoken CRM intents | OpenAI Whisper/TTS/Realtime |
| `/api/symbolic/review` | Foreman / jev-code / jev-git / jev-review | none |
| Company OS `/api/company-os/overview` | Deterministic reads; Jev wardens on writes | none |
| MCP `jev_evaluate`, `jev_decide` | Same kernel, agent-callable | none |

## Env

```
TYPESAFE_API_KEY=...          # preferred
AI_GATEWAY_API_KEY=...        # fallback evaluate
OPENROUTER_API_KEY=...        # Qwen generation + optional Jev
OPENAI_API_KEY=...            # voice, embeddings, generation fallback
```

The app still boots with none of these. Missing Jev fails open on routing and
fails closed (asks for confirmation) only after a live Jev call on a write tool
errors.

## Policy

Thresholds live in `src/lib/jev/policy.ts`. Pin `jev-1.13.0` once they are
swept on labeled Scalar data (`src/lib/jev/eval/validate.ts`). Treat every
user field as data, never as instructions.

## Lineage

Classification and routing: notra, jev-router, typesafe-jev, eve, jev-ultrafast,
decide-mcp, typesafe-ai/skills.
Guardrails: is-malicious, pi-jev, jev-review, abide, hunch, pi-heed, JevSlop.
Symbolic: foreman, jev-code, jev-git, clean-code-review.
Company OS: opencompany + openwork warden packs.
Harness: [Building a Harness with Jev](https://www.langchain.com/blog/building-a-harness-with-jev).
