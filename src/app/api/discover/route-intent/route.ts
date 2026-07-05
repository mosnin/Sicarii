import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

const MODEL = process.env.OPENAI_REFINER_MODEL ?? "gpt-5-mini";

// The one command box routes plain language to a single discovery action. This
// endpoint is the router: given an intent, it returns the best tool id + the
// params to prefill, and the /discover page auto-runs it. No LLM key => a
// heuristic fallback still routes the common cases, so the box never dead-ends.

// The tool menu the classifier chooses from. Kept lean + server-only (the full
// field metadata lives on the /discover page). id must match a tool there.
const TOOLS: { id: string; purpose: string; params: string[] }[] = [
  { id: "find-entities", purpose: "Find/list companies matching a described ideal customer (B2B, startups, funded, by industry/tech/region). The default for 'find companies'.", params: ["query"] },
  { id: "maps-leads", purpose: "Find LOCAL businesses you could visit (restaurants, dentists, salons, law firms) with phone + address, from Google Maps.", params: ["query", "location"] },
  { id: "intent-scan", purpose: "Find companies/people actively in-market for a product like the user's (buying signals).", params: ["query"] },
  { id: "search-companies", purpose: "Filter a company database by country + industry + size.", params: ["industry", "country", "size"] },
  { id: "company-lookalikes", purpose: "Find companies similar to a given company domain.", params: ["domain"] },
  { id: "enrich-domain", purpose: "Get a full firmographic profile for ONE known company domain.", params: ["domain"] },
  { id: "company-funding", purpose: "Funding rounds, investors, acquisitions for a company domain.", params: ["domain"] },
  { id: "tech-stack", purpose: "The technologies a company (by domain) runs.", params: ["domain"] },
  { id: "company-news", purpose: "Recent news and signals for a company domain.", params: ["domain"] },
  { id: "find-people", purpose: "Find people at a company (by domain), optionally by department/seniority.", params: ["domain", "department", "level"] },
  { id: "find-email", purpose: "Find a verified work email for a named person at a domain.", params: ["firstName", "lastName", "domain"] },
  { id: "find-mobile", purpose: "Find a mobile number for a named professional.", params: ["firstName", "lastName", "domain"] },
  { id: "contact-info", purpose: "Scrape a company website URL for emails/phones/socials as contacts.", params: ["url"] },
  { id: "analyze-site", purpose: "Deep-read a company website URL and pull the people on it.", params: ["url"] },
  { id: "scrape-url", purpose: "Extract clean markdown text from a single URL.", params: ["url"] },
  { id: "deep-research", purpose: "Exhaustive, sourced research on a topic/person/company (a real question).", params: ["query"] },
  { id: "quick-research", purpose: "Fast standard-depth research; good for recent news/overview.", params: ["query"] },
  { id: "web-search", purpose: "Plain web search with source links (fallback for general queries).", params: ["query"] },
];

const VALID = new Set(TOOLS.map((t) => t.id));

const schema = z.object({
  intent: z.string().trim().min(2).max(400),
});

// Heuristic fallback when no LLM is configured. Covers the highest-traffic
// intents so the box still works without OPENAI_API_KEY.
function heuristicRoute(intent: string): { toolId: string; params: Record<string, string> } {
  const t = intent.toLowerCase().trim();
  const domainMatch = t.match(/([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/i);
  const domain = domainMatch?.[1];

  if (domain && /\b(enrich|firmographic|profile|about)\b/.test(t)) return { toolId: "enrich-domain", params: { domain } };
  if (domain && /\b(fund|raise|investor|series|acqui)/.test(t)) return { toolId: "company-funding", params: { domain } };
  if (domain && /\b(tech|stack|technolog|tool)\b/.test(t)) return { toolId: "tech-stack", params: { domain } };
  if (domain && /\bnews|signal|update\b/.test(t)) return { toolId: "company-news", params: { domain } };
  if (/\b(local|near me|restaurant|dentist|salon|shop|store|clinic|plumber|cafe|bar|gym|realtor|contractor|roofer)s?\b/.test(t))
    return { toolId: "maps-leads", params: { query: intent } };
  if (/\b(in-market|buying|actively looking|intent|ready to buy)\b/.test(t))
    return { toolId: "intent-scan", params: { query: intent } };
  if (/\b(who is|what is|research|explain|how does|why|tell me about)\b/.test(t))
    return { toolId: "quick-research", params: { query: intent } };
  if (/\b(find|list|companies|startups|prospects|leads|accounts)\b/.test(t))
    return { toolId: "find-entities", params: { query: intent } };
  return { toolId: "web-search", params: { query: intent } };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`route-intent:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Say what you want to find." }, { status: 400 });
    const { intent } = parsed.data;

    // No LLM key: heuristic route (still useful, never dead-ends).
    if (!process.env.OPENAI_API_KEY) {
      const r = heuristicRoute(intent);
      return NextResponse.json({ ...r, source: "heuristic" });
    }

    const menu = TOOLS.map((t) => `- ${t.id} (params: ${t.params.join(", ") || "none"}): ${t.purpose}`).join("\n");

    const { object } = await generateObject({
      model: openai(MODEL),
      schema: z.object({
        toolId: z.string(),
        params: z.record(z.string(), z.string()),
        why: z.string().max(160),
      }),
      prompt: `You route a user's plain-language request to exactly ONE discovery tool and extract its parameters.

Tools:
${menu}

Rules:
- Pick the single best tool id from the list above.
- Extract only that tool's listed params. Put the user's phrasing into "query" for search/find tools; extract a clean "domain" (like acme.com, no https) or "location" when present.
- For "find companies / startups / prospects", prefer find-entities unless it's clearly LOCAL walk-in businesses (then maps-leads).
- Keep param values short and clean.

User request: """${intent}"""`,
    });

    const toolId = VALID.has(object.toolId) ? object.toolId : heuristicRoute(intent).toolId;
    // Keep only known params for the chosen tool; drop empties.
    const allowed = new Set(TOOLS.find((t) => t.id === toolId)?.params ?? []);
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(object.params ?? {})) {
      if (allowed.has(k) && typeof v === "string" && v.trim()) params[k] = v.trim().slice(0, 300);
    }
    if (Object.keys(params).length === 0) Object.assign(params, heuristicRoute(intent).params);

    return NextResponse.json({ toolId, params, why: object.why, source: "llm" });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/discover/route-intent", e);
    return NextResponse.json({ error: "Couldn't route that. Try rephrasing." }, { status: 500 });
  }
}
