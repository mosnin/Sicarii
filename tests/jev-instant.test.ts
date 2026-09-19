import { describe, it, expect } from "vitest";
import {
  classifyInstant,
  decideTurn,
  extractMissedQuery,
  looksLikeLookup,
  tooHardForInstant,
} from "@/lib/jev";

describe("classifyInstant", () => {
  it("routes enrich and tell-me-about as grounded CRM turns", () => {
    expect(classifyInstant("enrich Acme")).toMatchObject({
      tool: "enrich_entity",
      query: "Acme",
    });
    expect(classifyInstant("tell me about Acme")).toMatchObject({
      tool: "search_crm",
      query: "Acme",
      detail: true,
    });
  });

  it("routes an obvious CRM lookup without TypeSafe", () => {
    expect(classifyInstant("show me acme")).toMatchObject({
      tool: "search_crm",
      query: "acme",
      source: "instant",
    });
    expect(classifyInstant("who is Jane Doe")).toMatchObject({ tool: "search_crm" });
    expect(classifyInstant("list contacts")).toMatchObject({ tool: "list_contacts", query: "" });
    expect(classifyInstant("list companies")).toMatchObject({ tool: "list_entities", query: "" });
    expect(classifyInstant("who needs a follow-up")).toMatchObject({ tool: "list_due_followups" });
    expect(classifyInstant("who should I follow up with")).toMatchObject({ tool: "list_due_followups" });
    expect(classifyInstant("how many credits do I have")).toMatchObject({ tool: "get_billing" });
    expect(classifyInstant("show variant stats")).toMatchObject({ tool: "list_variant_stats" });
    expect(classifyInstant("pick a subject line")).toMatchObject({
      tool: "select_variant",
      query: "SUBJECT",
    });
    expect(classifyInstant("list segments")).toMatchObject({ tool: "list_segments" });
    expect(classifyInstant("show the Enterprise segment")).toMatchObject({
      tool: "get_segment",
      name: "Enterprise",
    });
    expect(classifyInstant("show my pipelines")).toMatchObject({ tool: "list_pipelines" });
    expect(classifyInstant("show the Outbound pipeline")).toMatchObject({
      tool: "get_pipeline",
      name: "Outbound",
    });
    expect(classifyInstant("pipeline metrics for Outbound")).toMatchObject({
      tool: "pipeline_metrics",
      name: "Outbound",
    });
    expect(classifyInstant("show pending drafts")).toMatchObject({ tool: "list_pending_drafts" });
    expect(classifyInstant("list swarm runs")).toMatchObject({ tool: "list_swarm_runs" });
    expect(classifyInstant("autopilot status")).toMatchObject({ tool: "get_autopilot_status" });
    expect(classifyInstant("show emails for Jane")).toMatchObject({
      tool: "list_emails",
      query: "Jane",
    });
    expect(classifyInstant("list activities for Acme")).toMatchObject({
      tool: "list_activities",
      query: "Acme",
    });
    expect(classifyInstant("show calls for Jane")).toMatchObject({
      tool: "list_contact_calls",
      query: "Jane",
    });
    expect(classifyInstant("show linkedin messages for Jane")).toMatchObject({
      tool: "list_social_messages",
      query: "Jane",
    });
    expect(classifyInstant("show emails for Jane")).toMatchObject({ tool: "list_emails" });
    expect(classifyInstant("create a segment called Enterprise")).toMatchObject({
      tool: "create_segment",
      name: "Enterprise",
    });
    expect(classifyInstant("add Outbound as a pipeline")).toMatchObject({
      tool: "create_pipeline",
      name: "Outbound",
    });
    expect(classifyInstant("pause autopilot")).toMatchObject({ tool: "pause_autopilot" });
    expect(classifyInstant("enrich Jane's linkedin")).toMatchObject({
      tool: "enrich_contact",
      query: "Jane",
      field: "linkedin",
    });
    expect(classifyInstant("find socials for Jane")).toMatchObject({
      tool: "find_socials",
      query: "Jane",
    });
    expect(classifyInstant("remember that Jane is the CFO")).toMatchObject({
      tool: "remember",
      query: "Jane is the CFO",
    });
    expect(classifyInstant("where did Jane's email come from")).toMatchObject({
      tool: "get_provenance",
      query: "Jane",
    });
    expect(classifyInstant("build a segment for dentists")).toMatchObject({
      tool: "build_smart_segment",
      query: "dentists",
    });
    expect(classifyInstant("verify Acme")).toMatchObject({
      tool: "verify_entity",
      query: "Acme",
    });
    expect(classifyInstant("what tech does Acme use")).toMatchObject({
      tool: "detect_tech",
      query: "Acme",
    });
    expect(classifyInstant("detect tech for Acme")).toMatchObject({
      tool: "detect_tech",
      query: "Acme",
    });
  });

  it("routes discovery and local maps", () => {
    expect(classifyInstant("find B2B fintech startups in Miami")).toMatchObject({
      tool: "find_companies",
    });
    expect(classifyInstant("dentists in Austin, TX")).toMatchObject({
      tool: "maps_leads",
      query: "dentists",
      location: "Austin, TX",
    });
  });

  it("parses a create-company utterance", () => {
    expect(classifyInstant("add Acme as a company")).toMatchObject({
      tool: "create_entity",
      name: "Acme",
    });
    expect(classifyInstant("add Acme as a company acme.com")).toMatchObject({
      tool: "create_entity",
      name: "Acme",
      domain: "acme.com",
    });
  });

  it("parses a create-contact utterance", () => {
    expect(classifyInstant("add contact Jane Doe at Acme jane@acme.com")).toMatchObject({
      tool: "create_contact",
      name: "Jane Doe",
      email: "jane@acme.com",
      company: "Acme",
    });
  });

  it("confirms discovery after an empty CRM miss", () => {
    const prior =
      'I did not find companies or people in the CRM for "acme". Say the word if you want me to discover new ones.';
    expect(classifyInstant("yes", prior)).toMatchObject({
      tool: "find_companies",
      query: "acme",
    });
    expect(extractMissedQuery(prior)).toBe("acme");
  });

  it("refuses compose, compound, and destructive turns", () => {
    expect(classifyInstant("write a breakup email for Jane")).toBeNull();
    expect(classifyInstant("find companies and then email them")).toBeNull();
    expect(classifyInstant("delete all contacts")).toBeNull();
    expect(tooHardForInstant("draft a careful note")).toBe(true);
  });

  it("looksLikeLookup is true only for safe read prefixes", () => {
    expect(looksLikeLookup("show me acme")).toBe(true);
    expect(looksLikeLookup("write an email about acme")).toBe(false);
  });
});

describe("decideTurn instant skip", () => {
  it("does not call TypeSafe on show-me lookups", async () => {
    let hits = 0;
    const decision = await decideTurn({
      message: "show me acme",
      client: {
        async evaluate() {
          hits += 1;
          throw new Error("should not evaluate");
        },
      },
    });
    expect(hits).toBe(0);
    expect(decision).toMatchObject({ kind: "tool", tool: "search_crm" });
  });
});
