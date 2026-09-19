import { describe, it, expect } from "vitest";
import {
  compactCrmPayload,
  compactUiMessages,
  factCard,
  factsFromSearch,
  formatDetailCard,
  inventedClaims,
} from "@/lib/jev";

describe("factsFromSearch / formatDetailCard", () => {
  it("builds a unique company card", () => {
    const payload = {
      entities: [
        {
          id: "e1",
          name: "Acme",
          domain: "acme.com",
          industry: "fintech",
          location: "Miami",
          status: "ENRICHED",
          _count: { contacts: 3 },
        },
      ],
      contacts: [],
    };
    const facts = factsFromSearch(payload);
    expect(facts).toHaveLength(1);
    expect(formatDetailCard(facts, "acme")).toContain("Acme (acme.com)");
    expect(formatDetailCard(facts, "acme")).toContain("fintech");
    expect(factCard(facts)).toContain("acme.com");
  });
});

describe("inventedClaims", () => {
  it("flags a company and email that are not in the CRM facts", () => {
    const facts = factsFromSearch({
      entities: [{ id: "e1", name: "Acme", domain: "acme.com" }],
      contacts: [],
    });
    const hits = inventedClaims(
      "You should email Bob at Widget Corp widget.io about Acme.",
      facts,
    );
    expect(hits.some((h) => /widget/i.test(h))).toBe(true);
    expect(hits.some((h) => /acme/i.test(h))).toBe(false);
  });

  it("returns nothing when facts are empty", () => {
    expect(inventedClaims("Acme is great", [])).toEqual([]);
  });
});

describe("compactCrmPayload", () => {
  it("keeps id/name/domain and drops enrichment blobs", () => {
    const slim = compactCrmPayload({
      entities: [
        { id: "e1", name: "Acme", domain: "acme.com", enrichment: { huge: "x".repeat(200) } },
      ],
      contacts: [],
    }) as { entities: Array<{ name?: string; enrichment?: unknown }> };
    expect(slim.entities[0]?.name).toBe("Acme");
    expect(slim.entities[0]?.enrichment).toBeUndefined();
  });
});

describe("compactUiMessages", () => {
  it("drops tool parts on older turns and keeps recent text", () => {
    const messages = [
      {
        id: "1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "old" }],
      },
      {
        id: "2",
        role: "assistant" as const,
        parts: [
          { type: "text" as const, text: "old reply" },
          { type: "tool-search_crm", toolCallId: "t1", state: "output-available", output: { huge: true } },
        ],
      },
      {
        id: "3",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "now" }],
      },
      {
        id: "4",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "latest" }],
      },
    ];
    const compact = compactUiMessages(messages, 8);
    const oldAssistant = compact[1];
    expect(oldAssistant?.parts?.some((p) => String(p.type).startsWith("tool-"))).toBe(false);
    expect(compact.at(-1)?.parts?.some((p) => p.type === "text")).toBe(true);
  });
});
