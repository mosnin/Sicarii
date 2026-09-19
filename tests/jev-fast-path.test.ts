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
    expect(lookupQuery("show acme")).toBe("acme");
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

  it("skips the chat model on an instant create", () => {
    expect(canSkipGeneration({ kind: "tool", tool: "create_entity", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "create_segment", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "pause_autopilot", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "pipeline_metrics", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "get_segment", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "remember", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "get_provenance", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "verify_entity", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "detect_tech", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "get_usage", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "get_balance", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "jev_triage", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "jev_scan_malicious", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "jev_grade_page", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "score_fit", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "count_entities", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "count_contacts", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "count_due_followups", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "get_entity", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "get_contact", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "update_contact", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "add_to_pipeline", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "add_to_segment", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "log_outreach", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "add_activity", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "list_recent_discoveries", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "update_segment", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "update_pipeline", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "sync_call", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "log_call", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "update_pipeline_entry", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "save_email_context", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "get_swarm_run", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "remove_pipeline_entry", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "remove_segment_member", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "create_variant", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "draft_breakups", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "propose_autopilot_plan", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "log_social_message", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "extract_contact_details", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "update_entity", confidence: 0.94 })).toBe(true);
    expect(canSkipGeneration({ kind: "tool", tool: "delete_entity", confidence: 0.94 })).toBe(false);
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

  it("hides paid discovery when Jev picked a single write tool", () => {
    const names = activeToolNames(
      { kind: "tool", tool: "draft_breakups", confidence: 0.9 },
      all,
    );
    expect(names).toContain("draft_breakups");
    expect(names).toContain("search_crm");
    expect(names).not.toContain("find_companies");
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

  it("lists due follow-ups and remaining credits", () => {
    expect(
      formatFastReply({
        tool: "list_due_followups",
        query: "follow-ups",
        payload: [{ name: "Jane", company: "Acme" }],
      }),
    ).toContain("Jane at Acme");
    expect(
      formatFastReply({
        tool: "get_billing",
        query: "credits",
        payload: { creditsRemaining: 42, plan: "pro" },
      }),
    ).toBe("You have 42 credits remaining on the pro plan.");
    expect(
      formatFastReply({
        tool: "get_autopilot_status",
        query: "autopilot",
        payload: [
          {
            name: "Miami dentists",
            status: "active",
            totalCredits: 200,
            allocations: [{ category: "discovery", allocated: 120, spent: 40 }],
          },
        ],
      }),
    ).toContain("Miami dentists is active");
    expect(
      formatFastReply({
        tool: "list_segments",
        query: "segments",
        payload: [{ name: "Miami dentists" }],
      }),
    ).toBe("1 segment: Miami dentists.");
    expect(
      formatFastReply({
        tool: "list_pipelines",
        query: "pipelines",
        payload: [{ name: "Outbound", _count: { entries: 12 } }],
      }),
    ).toBe("1 pipeline: Outbound (12).");
    expect(
      formatFastReply({
        tool: "list_emails",
        query: "Jane",
        payload: [{ subject: "Intro", direction: "OUTBOUND" }],
      }),
    ).toContain("1 email with Jane");
    expect(
      formatFastReply({
        tool: "list_social_messages",
        query: "Jane",
        payload: [{ channel: "LINKEDIN", body: "Great to connect" }],
      }),
    ).toContain("1 social message with Jane");
    expect(
      formatFastReply({
        tool: "create_segment",
        query: "Enterprise",
        payload: { name: "Enterprise" },
      }),
    ).toBe("Created segment Enterprise.");
    expect(
      formatFastReply({
        tool: "pause_autopilot",
        query: "pause",
        payload: { name: "Miami dentists", status: "paused" },
      }),
    ).toContain("Paused Miami dentists");
    expect(
      formatFastReply({
        tool: "get_segment",
        query: "Enterprise",
        payload: { name: "Enterprise", _count: { members: 3 }, members: [] },
      }),
    ).toBe("Segment Enterprise has 3 members.");
    expect(
      formatFastReply({
        tool: "pipeline_metrics",
        query: "Outbound",
        payload: { name: "Outbound", total: 12, won: 2, lost: 1, avgDealScore: 44 },
      }),
    ).toContain("12 in pipeline");
    expect(
      formatFastReply({
        tool: "remember",
        query: "Jane is the CFO",
        payload: { remembered: true },
      }),
    ).toContain("Jane is the CFO");
    expect(
      formatFastReply({
        tool: "get_provenance",
        query: "Jane",
        payload: { email: { source: "explorium", confidence: 0.9 } },
      }),
    ).toContain("email via explorium");
    expect(
      formatFastReply({
        tool: "verify_entity",
        query: "Acme",
        payload: { name: "Acme", verified: { gleif: true, companiesHouse: false, secEdgar: true } },
      }),
    ).toBe("Verified Acme via GLEIF, SEC EDGAR.");
    expect(
      formatFastReply({
        tool: "detect_tech",
        query: "Acme",
        payload: { name: "Acme", tech: [{ name: "Next.js" }, { name: "Stripe" }] },
      }),
    ).toBe("Acme uses Next.js, Stripe.");
    expect(
      formatFastReply({
        tool: "get_usage",
        query: "price list",
        payload: { creditsRemaining: 80, plan: "starter", actionCosts: { enrich: 8, find_companies: 12 } },
      }),
    ).toContain("Costs: enrich 8");
    expect(
      formatFastReply({
        tool: "get_entity",
        query: "Acme",
        payload: { name: "Acme", domain: "acme.com", _count: { contacts: 2 } },
      }),
    ).toBe("Acme (acme.com). 2 contacts.");
    expect(
      formatFastReply({
        tool: "get_contact",
        query: "Jane",
        payload: { name: "Jane", title: "CFO", company: "Acme", email: "jane@acme.com" },
      }),
    ).toBe("Jane at Acme (CFO, jane@acme.com).");
    expect(
      formatFastReply({
        tool: "update_contact",
        query: "Jane",
        payload: { name: "Jane", status: "CONTACTED" },
      }),
    ).toBe("Marked Jane as contacted.");
    expect(
      formatFastReply({
        tool: "update_contact",
        query: "Jane",
        payload: { name: "Jane", twitter: "https://x.com/jane" },
      }),
    ).toBe("Set Jane's X to https://x.com/jane.");
    expect(
      formatFastReply({
        tool: "update_contact",
        query: "Jane",
        payload: { name: "Jane", facebook: "https://facebook.com/jane" },
      }),
    ).toBe("Set Jane's Facebook to https://facebook.com/jane.");
    expect(
      formatFastReply({
        tool: "update_contact",
        query: "Jane",
        payload: { name: "Jane", instagram: "https://instagram.com/jane" },
      }),
    ).toBe("Set Jane's Instagram to https://instagram.com/jane.");
    expect(
      formatFastReply({
        tool: "update_entity",
        query: "Acme",
        payload: { name: "Acme", notes: "Series B fintech" },
      }),
    ).toBe("Set Acme's notes.");
    expect(
      formatFastReply({
        tool: "update_entity",
        query: "Acme",
        payload: { name: "Acme", description: "B2B payments for clinics" },
      }),
    ).toBe("Set Acme's description.");
    expect(
      formatFastReply({
        tool: "update_contact",
        query: "Jane",
        payload: { name: "Jane", website: "https://jane.dev" },
      }),
    ).toBe("Set Jane's website to https://jane.dev.");
    expect(
      formatFastReply({
        tool: "add_to_pipeline",
        query: "Jane",
        payload: { who: "Jane", name: "Outbound", added: 1 },
      }),
    ).toBe("Added Jane to Outbound.");
    expect(
      formatFastReply({
        tool: "add_to_segment",
        query: "Jane",
        payload: { who: "Jane", name: "ICP", added: 0 },
      }),
    ).toBe("Jane is already in ICP.");
    expect(
      formatFastReply({
        tool: "log_outreach",
        query: "Jane",
        payload: { name: "Jane", channel: "email" },
      }),
    ).toBe("Logged email outreach to Jane.");
    expect(
      formatFastReply({
        tool: "add_activity",
        query: "Jane",
        payload: { name: "Jane", body: "interested in Q4" },
      }),
    ).toBe("Noted on Jane: interested in Q4");
    expect(
      formatFastReply({
        tool: "list_recent_discoveries",
        query: "",
        payload: [{ name: "Acme", kind: "entity" }, { name: "Jane", kind: "contact" }],
      }),
    ).toBe("2 recent discoveries: Acme, Jane.");
    expect(
      formatFastReply({
        tool: "update_pipeline",
        query: "Outbound",
        payload: { name: "Enterprise" },
      }),
    ).toBe("Renamed Outbound to Enterprise.");
    expect(
      formatFastReply({
        tool: "sync_call",
        query: "Jane",
        payload: { name: "Jane", status: "completed" },
      }),
    ).toBe("Synced Jane's last call (completed).");
    expect(
      formatFastReply({
        tool: "log_call",
        query: "Jane",
        payload: { name: "Jane" },
      }),
    ).toBe("Logged a call with Jane.");
    expect(
      formatFastReply({
        tool: "score_fit",
        query: "Acme",
        payload: { name: "Acme", score: 82, kind: "entity" },
      }),
    ).toBe("Acme scores 82/100 as a fit.");
    expect(
      formatFastReply({
        tool: "score_fit",
        query: "Acme",
        payload: { error: "Add your Product Context first. Fit is scored against it." },
      }),
    ).toBe("Add your Product Context first. Fit is scored against it.");
    expect(
      formatFastReply({
        tool: "update_entity",
        query: "Acme",
        payload: { name: "Acme", size: "50-200" },
      }),
    ).toBe("Set Acme's size to 50-200.");
    expect(
      formatFastReply({
        tool: "update_entity",
        query: "Acme",
        payload: { name: "Acme", status: "ARCHIVED" },
      }),
    ).toBe("Marked Acme as archived.");
    expect(
      formatFastReply({
        tool: "update_contact",
        query: "Jane",
        payload: { name: "Jane", source: "linkedin" },
      }),
    ).toBe("Set Jane's source to linkedin.");
    expect(
      formatFastReply({
        tool: "update_contact",
        query: "Jane",
        payload: { name: "Jane", tags: ["ICP", "inbound"] },
      }),
    ).toBe("Tagged Jane as ICP, inbound.");
    expect(
      formatFastReply({
        tool: "update_entity",
        query: "Acme",
        payload: { name: "Acme", tags: ["enterprise"] },
      }),
    ).toBe("Tagged Acme as enterprise.");
    expect(
      formatFastReply({
        tool: "draft_breakups",
        query: "",
        payload: { drafted: 3, skipped: 1, scanned: 4, staleDays: 14 },
      }),
    ).toBe("Drafted 3 breakup emails for review, skipped 1 already pending.");
    expect(
      formatFastReply({
        tool: "draft_breakups",
        query: "",
        payload: { drafted: 0, skipped: 0, scanned: 0 },
      }),
    ).toBe("No stalled deals needed a breakup draft.");
    expect(
      formatFastReply({
        tool: "propose_autopilot_plan",
        query: "",
        payload: { name: "Daily 50 credit autopilot", totalCredits: 50, cadence: "daily" },
      }),
    ).toBe("Proposed draft plan Daily 50 credit autopilot (50 credits, daily). Approve it on the dashboard.");
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
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
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
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
      },
    });
    expect(result).toBeNull();
  });

  it("creates a company from an instant route without generation", async () => {
    const result = await executeFastPath({
      message: "add Acme as a company",
      decision: { kind: "tool", tool: "create_entity", confidence: 0.94 },
      instant: { tool: "create_entity", query: "Acme", name: "Acme", source: "instant" },
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
        createEntity: async (name, domain, extra) => ({ name, domain: domain ?? null, ...extra }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
      },
    });
    expect(result?.tool).toBe("create_entity");
    expect(result?.text).toContain("Added Acme");
  });

  it("creates a company with phone, size, and tags from an instant route", async () => {
    let captured: {
      name: string;
      domain?: string;
      extra?: { phone?: string; size?: string; tags?: string[]; description?: string; notes?: string };
    } | null = null;
    const result = await executeFastPath({
      message: "add a company called Acme size 50-200 phone 512-555-0100 tagged enterprise",
      decision: { kind: "tool", tool: "create_entity", confidence: 0.94 },
      instant: {
        tool: "create_entity",
        query: "Acme",
        name: "Acme",
        phone: "512-555-0100",
        size: "50-200",
        tags: ["enterprise"],
        description: "Series B",
        note: "follow up Q4",
        source: "instant",
      },
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
        createEntity: async (name, domain, extra) => {
          captured = { name, domain, extra };
          return { name, domain: domain ?? null, ...extra };
        },
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
      },
    });
    expect(result?.tool).toBe("create_entity");
    expect(captured).toEqual({
      name: "Acme",
      domain: undefined,
      extra: {
        phone: "512-555-0100",
        size: "50-200",
        tags: ["enterprise"],
        description: "Series B",
        notes: "follow up Q4",
      },
    });
  });

  it("creates a contact with source, tags, website, and location", async () => {
    let captured: {
      name?: string;
      source?: string;
      tags?: string[];
      website?: string;
      location?: string;
    } | null = null;
    const result = await executeFastPath({
      message: "add contact Jane source linkedin location Austin tagged ICP website https://jane.dev",
      decision: { kind: "tool", tool: "create_contact", confidence: 0.94 },
      instant: {
        tool: "create_contact",
        query: "Jane",
        name: "Jane",
        crmSource: "linkedin",
        location: "Austin",
        tags: ["ICP"],
        website: "https://jane.dev",
        source: "instant",
      },
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
        createEntity: async () => ({ name: "x" }),
        createContact: async (input) => {
          captured = input;
          return { name: input.name };
        },
        enrichEntity: async () => ({ name: "x" }),
      },
    });
    expect(result?.tool).toBe("create_contact");
    expect(captured).toMatchObject({
      name: "Jane",
      source: "linkedin",
      tags: ["ICP"],
      website: "https://jane.dev",
      location: "Austin",
    });
  });

  it("reuses a speculative CRM prefetch", async () => {
    let searches = 0;
    const result = await executeFastPath({
      message: "show me acme",
      decision: { kind: "tool", tool: "search_crm", confidence: 0.94 },
      prefetch: { entities: [{ name: "Acme", domain: "acme.com" }], contacts: [] },
      runners: {
        searchCrm: async () => {
          searches += 1;
          return { entities: [], contacts: [] };
        },
        findCompanies: async () => ({ added: 0 }),
        mapsLeads: async () => ({ added: 0 }),
        swarmDiscover: async () => ({ added: 0 }),
        searchWeb: async () => [],
        googleSearch: async () => ({ results: [] }),
        recall: async () => [],
        listPendingDrafts: async () => [],
        getAutopilotStatus: async () => ({}),
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
      },
    });
    expect(searches).toBe(0);
    expect(result?.text).toContain("Acme (acme.com)");
  });

  it("counts companies and contacts without generation", async () => {
    const companies = await executeFastPath({
      message: "how many companies",
      decision: { kind: "tool", tool: "count_entities", confidence: 0.94 },
      instant: { tool: "count_entities", query: "how many companies", source: "instant" },
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
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
        countEntities: async () => 12,
      },
    });
    expect(companies?.tool).toBe("count_entities");
    expect(companies?.text).toBe("You have 12 companies in the CRM.");

    const archived = await executeFastPath({
      message: "count archived companies",
      decision: { kind: "tool", tool: "count_entities", confidence: 0.94 },
      instant: {
        tool: "count_entities",
        query: "count archived companies",
        entityStatus: "ARCHIVED",
        source: "instant",
      },
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
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
        countEntities: async (status) => (status === "ARCHIVED" ? 3 : 0),
      },
    });
    expect(archived?.text).toBe("You have 3 companies marked archived in the CRM.");
  });

  it("counts due follow-ups without loading rows", async () => {
    const result = await executeFastPath({
      message: "how many follow-ups older than 14 days",
      decision: { kind: "tool", tool: "count_due_followups", confidence: 0.94 },
      instant: {
        tool: "count_due_followups",
        query: "how many follow-ups older than 14 days",
        staleDays: 14,
        source: "instant",
      },
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
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
        countDueFollowups: async (staleDays) => (staleDays === 14 ? 7 : 0),
      },
    });
    expect(result?.tool).toBe("count_due_followups");
    expect(result?.text).toBe("You have 7 contacts due for a follow-up older than 14 days.");
  });

  it("lists entities through the list runner, not searchCrm", async () => {
    let searched = 0;
    let listed = 0;
    const result = await executeFastPath({
      message: "list companies",
      decision: { kind: "tool", tool: "list_entities", confidence: 0.94 },
      instant: { tool: "list_entities", query: "", source: "instant" },
      runners: {
        searchCrm: async () => {
          searched += 1;
          return { entities: [], contacts: [] };
        },
        findCompanies: async () => ({ added: 0 }),
        mapsLeads: async () => ({ added: 0 }),
        swarmDiscover: async () => ({ added: 0 }),
        searchWeb: async () => [],
        googleSearch: async () => ({ results: [] }),
        recall: async () => [],
        listPendingDrafts: async () => [],
        getAutopilotStatus: async () => ({}),
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
        listEntities: async () => {
          listed += 1;
          return [{ name: "Acme", domain: "acme.com" }];
        },
      },
    });
    expect(searched).toBe(0);
    expect(listed).toBe(1);
    expect(result?.tool).toBe("list_entities");
    expect(result?.text).toContain("Acme");
  });

  it("scores a named CRM hit without generation", async () => {
    const result = await executeFastPath({
      message: "score Acme",
      decision: { kind: "tool", tool: "score_fit", confidence: 0.94 },
      instant: { tool: "score_fit", query: "Acme", source: "instant" },
      prefetch: { entities: [{ id: "e1", name: "Acme", industry: "SaaS" }], contacts: [] },
      runners: {
        searchCrm: async () => {
          throw new Error("prefetch should skip searchCrm");
        },
        findCompanies: async () => ({ added: 0 }),
        mapsLeads: async () => ({ added: 0 }),
        swarmDiscover: async () => ({ added: 0 }),
        searchWeb: async () => [],
        googleSearch: async () => ({ results: [] }),
        recall: async () => [],
        listPendingDrafts: async () => [],
        getAutopilotStatus: async () => ({}),
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
        scoreCrmFit: async (found, query) => {
          expect(query).toBe("Acme");
          expect(found).toMatchObject({ entities: [{ name: "Acme" }] });
          return { id: "e1", name: "Acme", kind: "entity", score: 82 };
        },
      },
    });
    expect(result?.tool).toBe("score_fit");
    expect(result?.text).toBe("Acme scores 82/100 as a fit.");
  });

  it("writes website onto a contact when only the person matches", async () => {
    const result = await executeFastPath({
      message: "set Jane website to https://jane.dev",
      decision: { kind: "tool", tool: "update_entity", confidence: 0.94 },
      instant: {
        tool: "update_entity",
        query: "Jane",
        website: "https://jane.dev",
        source: "instant",
      },
      prefetch: { entities: [], contacts: [{ id: "c1", name: "Jane", title: "CFO" }] },
      runners: {
        searchCrm: async () => {
          throw new Error("prefetch should skip searchCrm");
        },
        findCompanies: async () => ({ added: 0 }),
        mapsLeads: async () => ({ added: 0 }),
        swarmDiscover: async () => ({ added: 0 }),
        searchWeb: async () => [],
        googleSearch: async () => ({ results: [] }),
        recall: async () => [],
        listPendingDrafts: async () => [],
        getAutopilotStatus: async () => ({}),
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
        updateContact: async (id, patch) => {
          expect(id).toBe("c1");
          expect(patch).toEqual({ website: "https://jane.dev" });
          return { id, name: "Jane", website: patch.website };
        },
      },
    });
    expect(result?.text).toBe("Set Jane's website to https://jane.dev.");
  });

  it("asks to qualify website when both a company and a contact match", async () => {
    const result = await executeFastPath({
      message: "set Jane website to https://jane.dev",
      decision: { kind: "tool", tool: "update_entity", confidence: 0.94 },
      instant: {
        tool: "update_entity",
        query: "Jane",
        website: "https://jane.dev",
        source: "instant",
      },
      prefetch: {
        entities: [{ id: "e1", name: "Jane" }],
        contacts: [{ id: "c1", name: "Jane" }],
      },
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
        createEntity: async () => ({ name: "x" }),
        createContact: async () => ({ name: "y" }),
        enrichEntity: async () => ({ name: "x" }),
      },
    });
    expect(result?.text).toContain("so I don't guess");
  });
});
