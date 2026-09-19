import { describe, it, expect } from "vitest";
import {
  activeToolNames,
  canSkipGeneration,
  executeFastPath,
  formatFastReply,
  lookupQuery,
  pickActiveTools,
  splitLocalQuery,
  type Handler,
} from "@/lib/jev";

describe("lookupQuery / splitLocalQuery", () => {
  it("strips lookup prefixes", () => {
    expect(lookupQuery("show me acme")).toBe("acme");
    expect(lookupQuery("Find B2B fintech in Miami")).toBe("B2B fintech in Miami");
  });

  it("splits a local maps query", () => {
    expect(splitLocalQuery("dentists in Austin, TX")).toEqual({
      query: "dentists",
      location: "Austin, TX",
    });
  });
});

describe("canSkipGeneration", () => {
  it("skips the chat model on CRM lookup", () => {
    const d: Handler = { kind: "deterministic", action: "lookup", confidence: 0.9 };
    expect(canSkipGeneration(d)).toBe(true);
  });

  it("skips on a routed discover tool", () => {
    const d: Handler = { kind: "tool", tool: "find_companies", confidence: 0.88 };
    expect(canSkipGeneration(d)).toBe(true);
  });

  it("does not skip mutate or generate", () => {
    expect(canSkipGeneration({ kind: "deterministic", action: "mutate", confidence: 0.9 })).toBe(false);
    expect(canSkipGeneration({ kind: "generate", model: "qwen", effort: "low", confidence: 0.8 })).toBe(false);
  });
});

describe("activeToolNames", () => {
  const all = [
    "search_crm",
    "recall",
    "find_companies",
    "create_contact",
    "draft_breakups",
    "buy_credits",
  ];

  it("keeps the full catalog on escalate", () => {
    expect(activeToolNames({ kind: "escalate", reason: "x" }, all)).toEqual(all);
  });

  it("narrows generate turns to discover/read tools", () => {
    const names = activeToolNames({ kind: "generate", model: "qwen", effort: "low", confidence: 0.8 }, all);
    expect(names).toContain("search_crm");
    expect(names).toContain("find_companies");
    expect(names).not.toContain("buy_credits");
  });

  it("picks a subset from a tool map", () => {
    const tools = { search_crm: 1, buy_credits: 2, find_companies: 3 };
    const picked = pickActiveTools(tools, { kind: "deterministic", action: "lookup", confidence: 0.9 });
    expect(picked.search_crm).toBe(1);
    expect(picked.find_companies).toBe(3);
    expect(picked.buy_credits).toBeUndefined();
  });
});

describe("formatFastReply", () => {
  it("lists CRM hits in prose", () => {
    const text = formatFastReply({
      tool: "search_crm",
      query: "acme",
      payload: {
        entities: [{ name: "Acme", domain: "acme.com" }],
        contacts: [{ name: "Jane", company: "Acme" }],
      },
    });
    expect(text).toContain("Acme (acme.com)");
    expect(text).toContain("Jane");
    expect(text).not.toContain("**");
  });

  it("explains an empty CRM lookup", () => {
    expect(
      formatFastReply({ tool: "search_crm", query: "xyz", payload: { entities: [], contacts: [] } }),
    ).toContain("did not find");
  });
});

describe("executeFastPath", () => {
  it("runs search_crm for a lookup decision", async () => {
    const result = await executeFastPath({
      message: "show me acme",
      decision: { kind: "deterministic", action: "lookup", confidence: 0.92 },
      runners: {
        searchCrm: async (q) => {
          expect(q).toBe("acme");
          return { entities: [{ name: "Acme", domain: "acme.com" }], contacts: [] };
        },
        findCompanies: async () => ({ added: 0 }),
        mapsLeads: async () => ({ added: 0 }),
        swarmDiscover: async () => ({ added: 0 }),
        searchWeb: async () => [],
        googleSearch: async () => ({ results: [] }),
        recall: async () => [],
        listPendingDrafts: async () => [],
        getAutopilotStatus: async () => ({}),
      },
    });
    expect(result?.tool).toBe("search_crm");
    expect(result?.text).toContain("Acme");
  });

  it("returns null when generation is required", async () => {
    const result = await executeFastPath({
      message: "write a breakup email",
      decision: { kind: "generate", model: "qwen", effort: "medium", confidence: 0.8 },
      runners: {
        searchCrm: async () => ({ entities: [], contacts: [] }),
        findCompanies: async () => ({ added: 0 }),
        mapsLeads: async () => ({ added: 0 }),
        swarmDiscover: async () => ({ added: 0 }),
        searchWeb: async () => [],
        googleSearch: async () => ({ results: [] }),
        recall: async () => [],
        listPendingDrafts: async () => [],
        getAutopilotStatus: async () => ({}),
      },
    });
    expect(result).toBeNull();
  });
});
