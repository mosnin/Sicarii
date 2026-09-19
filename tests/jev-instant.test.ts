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
