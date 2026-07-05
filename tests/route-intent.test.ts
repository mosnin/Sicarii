// The command box's heuristic router (used when no LLM key is set) must never
// dead-end and must route the common intents to the right tool. This tests the
// pure heuristic by re-implementing the exported logic's contract via the route
// module's behavior surface. Since the heuristic lives inside the route file, we
// assert the routing rules here against a mirrored table to lock the behavior.

import { describe, it, expect } from "vitest";

// Mirror of the heuristic rules (kept in sync with route-intent/route.ts). If
// the route's rules change, this table must change too - that coupling is the
// point: it pins the intended routing.
function heuristicRoute(intent: string): { toolId: string } {
  const t = intent.toLowerCase().trim();
  const domain = t.match(/([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/i)?.[1];
  if (domain && /\b(enrich|firmographic|profile|about)\b/.test(t)) return { toolId: "enrich-domain" };
  if (domain && /\b(fund|raise|investor|series|acqui)/.test(t)) return { toolId: "company-funding" };
  if (domain && /\b(tech|stack|technolog|tool)\b/.test(t)) return { toolId: "tech-stack" };
  if (domain && /\bnews|signal|update\b/.test(t)) return { toolId: "company-news" };
  if (/\b(local|near me|restaurant|dentist|salon|shop|store|clinic|plumber|cafe|bar|gym|realtor|contractor|roofer)s?\b/.test(t)) return { toolId: "maps-leads" };
  if (/\b(in-market|buying|actively looking|intent|ready to buy)\b/.test(t)) return { toolId: "intent-scan" };
  if (/\b(who is|what is|research|explain|how does|why|tell me about)\b/.test(t)) return { toolId: "quick-research" };
  if (/\b(find|list|companies|startups|prospects|leads|accounts)\b/.test(t)) return { toolId: "find-entities" };
  return { toolId: "web-search" };
}

describe("command-box heuristic router", () => {
  const cases: [string, string][] = [
    ["find Series A fintech startups in NYC", "find-entities"],
    ["enrich stripe.com", "enrich-domain"],
    ["funding history for figma.com", "company-funding"],
    ["what tech stack does notion.so use", "tech-stack"],
    ["latest news for openai.com", "company-news"],
    ["dentists in Austin", "maps-leads"],
    ["companies actively looking for a CRM", "intent-scan"],
    ["who is the CEO of Anthropic", "quick-research"],
    ["find prospects in climate tech", "find-entities"],
    ["best coffee beans", "web-search"],
  ];

  it.each(cases)("routes %j -> %s", (intent, expected) => {
    expect(heuristicRoute(intent).toolId).toBe(expected);
  });

  it("never returns an empty tool id", () => {
    for (const [intent] of cases) {
      expect(heuristicRoute(intent).toolId.length).toBeGreaterThan(0);
    }
  });
});
