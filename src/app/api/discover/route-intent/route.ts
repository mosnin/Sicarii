import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { VALID_TOOL_IDS, heuristicRoute, filterParams, toolMenu } from "@/lib/intent-router";

const MODEL = process.env.OPENAI_REFINER_MODEL ?? "gpt-5-mini";

// The one command box routes plain language to a single discovery action. This
// endpoint is the router: given an intent, it returns the best tool id + the
// params to prefill, and the /discover page auto-runs it. No LLM key => a
// heuristic fallback still routes the common cases, so the box never dead-ends.
//
// Clerk-session only (getAuthenticatedUser), same as /api/discover - not
// reachable by API-key/MCP agents. The classifier is a small gpt-5-mini call; a
// tight rate limit bounds the cost since routing itself is not credit-metered
// (interactive UI research is free by design; see /api/discover).

const schema = z.object({
  intent: z.string().trim().min(2).max(400),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    // Tight limit: a human can't meaningfully type more than a few distinct
    // intents a minute, and this call hits a paid vendor (OpenAI) uncredited.
    const rate = await checkRateLimit(`route-intent:${user.id}`, 12, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Say what you want to find." }, { status: 400 });
    const { intent } = parsed.data;

    // No LLM key: heuristic route (still useful, never dead-ends).
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ...heuristicRoute(intent), source: "heuristic" });
    }

    const { object } = await generateObject({
      model: openai(MODEL),
      schema: z.object({
        toolId: z.string(),
        params: z.record(z.string(), z.string()),
        why: z.string().max(160),
      }),
      prompt: `You route a user's plain-language request to exactly ONE discovery tool and extract its parameters.

Tools:
${toolMenu()}

Rules:
- Pick the single best tool id from the list above.
- Extract only that tool's listed params. Put the user's phrasing into "query" for search/find tools; extract a clean "domain" (like acme.com, no https) or "location" when present.
- For "find companies / startups / prospects", prefer find-entities unless it's clearly LOCAL walk-in businesses (then maps-leads).
- Keep param values short and clean.

User request: """${intent}"""`,
    });

    // Validate the classifier's choice against the known set + allowlist its
    // params. An injected intent can at most pick a valid tool with bounded
    // params - never an arbitrary tool or unbounded input.
    const toolId = VALID_TOOL_IDS.has(object.toolId) ? object.toolId : heuristicRoute(intent).toolId;
    const params = filterParams(toolId, object.params);
    if (Object.keys(params).length === 0) Object.assign(params, heuristicRoute(intent).params);

    return NextResponse.json({ toolId, params, why: object.why, source: "llm" });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/discover/route-intent", e);
    return NextResponse.json({ error: "Couldn't route that. Try rephrasing." }, { status: 500 });
  }
}
