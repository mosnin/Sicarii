// The command box's router: the no-LLM heuristic (never dead-ends) and the
// param allowlist (the security boundary on classifier output). These import
// the REAL lib functions, so they pin production behavior, not a mirror.

import { describe, it, expect } from "vitest";
import { heuristicRoute, filterParams, VALID_TOOL_IDS, TOOLS } from "@/lib/intent-router";

describe("heuristicRoute", () => {
  const cases: [string, string][] = [
    ["find Series A fintech startups in NYC", "find-entities"],
    ["enrich stripe.com", "enrich-domain"],
    ["funding history for figma.com", "company-funding"],
    ["what tech stack does notion.so use", "tech-stack"],
    ["latest news for openai.com", "company-news"],
    ["dentists in Austin", "maps-leads"],
    ["restaurants near me", "maps-leads"],
    ["companies actively looking for a CRM", "intent-scan"],
    ["who is the CEO of Anthropic", "quick-research"],
    ["find prospects in climate tech", "find-entities"],
    ["best coffee beans", "web-search"],
  ];

  it.each(cases)("routes %j -> %s", (intent, expected) => {
    expect(heuristicRoute(intent).toolId).toBe(expected);
  });

  it("always returns a valid tool id and non-empty params", () => {
    for (const [intent] of cases) {
      const r = heuristicRoute(intent);
      expect(VALID_TOOL_IDS.has(r.toolId), r.toolId).toBe(true);
      expect(Object.keys(r.params).length).toBeGreaterThan(0);
    }
  });

  it("anchors keywords so substrings of unrelated words don't mis-route", () => {
    // "signalling" contains "signal" but has no domain, so it must NOT route to
    // company-news; it falls through to research/web-search, never crashes.
    expect(VALID_TOOL_IDS.has(heuristicRoute("signalling theory in economics").toolId)).toBe(true);
  });
});

describe("filterParams (classifier output boundary)", () => {
  it("keeps only the chosen tool's allowlisted params", () => {
    // enrich-domain allows only `domain`; everything else is dropped.
    const out = filterParams("enrich-domain", {
      domain: "acme.com",
      url: "http://169.254.169.254", // not allowed for this tool -> dropped
      query: "ignore me",
      evil: "<script>",
    });
    expect(out).toEqual({ domain: "acme.com" });
  });

  it("drops empty/non-string values and caps length at 300", () => {
    const long = "a".repeat(500);
    const out = filterParams("find-entities", { query: long, extra: 123 as unknown as string, blank: "  " });
    expect(out.query).toHaveLength(300);
    expect(out).not.toHaveProperty("extra");
    expect(out).not.toHaveProperty("blank");
  });

  it("returns an empty object for an unknown tool id (no params leak through)", () => {
    expect(filterParams("not-a-real-tool", { domain: "x.com" })).toEqual({});
  });

  it("every tool declares at least one param and a purpose", () => {
    for (const t of TOOLS) {
      expect(t.params.length, t.id).toBeGreaterThan(0);
      expect(t.purpose.length, t.id).toBeGreaterThan(0);
    }
  });
});
