import { describe, it, expect } from "vitest";
import {
  flattenSearchItems,
  verifyIdentity,
  gateOutboundDraft,
  triageInbound,
  gateMoney,
  scanMalicious,
  filterRealCompanies,
  deriveAnglesWithJev,
  type JevClient,
} from "@/lib/jev";
import type { JevResult, QuestionMap } from "@/lib/jev/contract";

function mockClient(answers: JevResult["answers"]): JevClient {
  return {
    async evaluate<Q extends QuestionMap>(req: { questions: Q }): Promise<JevResult<Q>> {
      return {
        model: "mock",
        answers: answers as JevResult<Q>["answers"],
        usage: { inputTokens: 8, outputTokens: 0 },
        latencyMs: 1,
        provider: "mock",
      };
    },
  };
}

describe("flattenSearchItems", () => {
  it("reads title/url rows from a results array", () => {
    const rows = flattenSearchItems({
      results: [
        { title: "Acme", url: "https://acme.com", snippet: "widgets" },
        { name: "Yelp list", url: "https://yelp.com/biz/x" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("https://acme.com");
  });
});

describe("verifyIdentity", () => {
  it("blocks a namesake when Jev is sure it is not the same person", async () => {
    const gate = await verifyIdentity({
      contactName: "Jane Doe",
      company: "Acme",
      domain: "acme.com",
      candidate: "jane@otherco.com",
      field: "email",
      client: mockClient({
        samePerson: { type: "noul", noul: 0.1 },
        nameOnlyMatch: { type: "noul", noul: 0.9 },
        identityStrength: { type: "score", score: 0, confidence: 0.8, legend: {}, probabilities: {} },
      }),
    });
    expect(gate.allow).toBe(false);
    expect(gate.reasons).toContain("not_same_person");
  });

  it("allows a strong same-person match", async () => {
    const gate = await verifyIdentity({
      contactName: "Jane Doe",
      company: "Acme",
      domain: "acme.com",
      candidate: "jane@acme.com",
      field: "email",
      client: mockClient({
        samePerson: { type: "noul", noul: 0.96 },
        nameOnlyMatch: { type: "noul", noul: 0.1 },
        identityStrength: { type: "score", score: 3, confidence: 0.9, legend: {}, probabilities: {} },
      }),
    });
    expect(gate.allow).toBe(true);
  });
});

describe("gateOutboundDraft", () => {
  it("blocks slop plus PII", async () => {
    const gate = await gateOutboundDraft({
      subject: "Quick one",
      body: "Just circling back!",
      phase: "send",
      client: mockClient({
        density: { type: "score", score: 0, confidence: 0.9, legend: {}, probabilities: {} },
        generality: { type: "score", score: 0, confidence: 0.8, legend: {}, probabilities: {} },
        overallScore: { type: "score", score: 4, confidence: 0.8, legend: {}, probabilities: {} },
        overallLabel: {
          type: "choice",
          choice: "slop",
          confidence: 0.9,
          probabilities: { slop: 0.9, not_slop: 0.1 },
        },
        "pii-review": { type: "noul", noul: 0.9 },
        "quote-accuracy": { type: "noul", noul: 0.1 },
        "crm-schema": { type: "noul", noul: 0.1 },
        "outbound-tone": { type: "noul", noul: 0.2 },
        "permission-scope": { type: "noul", noul: 0.1 },
        hasConcreteHook: { type: "noul", noul: 0.1 },
        wrongRecipientRisk: { type: "noul", noul: 0.2 },
      }),
    });
    expect(gate.allow).toBe(false);
    expect(gate.reasons).toEqual(expect.arrayContaining(["slop", "pii-review"]));
  });
});

describe("triageInbound", () => {
  it("returns a typed category and action", async () => {
    const t = await triageInbound("our stripe checkout is 500ing, losing sales", mockClient({
      category: {
        type: "choice",
        choice: "bug",
        confidence: 0.92,
        probabilities: { bug: 0.92, feature: 0.02, question: 0.02, docs: 0.01, chore: 0.01, lead: 0.01, other: 0.01 },
      },
      action: {
        type: "choice",
        choice: "investigate",
        confidence: 0.88,
        probabilities: {
          ask_contact: 0.02,
          reply: 0.05,
          investigate: 0.88,
          decide: 0.02,
          accept: 0.01,
          close: 0.01,
          wait: 0.01,
        },
      },
      severity: { type: "score", score: 3, confidence: 0.8, legend: {}, probabilities: {} },
      urgency: { type: "score", score: 2, confidence: 0.8, legend: {}, probabilities: {} },
    }));
    expect(t).toMatchObject({ category: "bug", action: "investigate", source: "jev" });
  });
});

describe("gateMoney", () => {
  it("blocks a spend Jev does not treat as authorized", async () => {
    const gate = await gateMoney({
      action: "buy_credits",
      amount: 5000,
      unit: "credits",
      client: mockClient({
        allowSpend: { type: "noul", noul: 0.1 },
        surpriseAmount: { type: "noul", noul: 0.9 },
      }),
    });
    expect(gate.allow).toBe(false);
    expect(gate.reasons).toEqual(expect.arrayContaining(["not_authorized", "surprise_amount"]));
  });
});

describe("scanMalicious", () => {
  it("blocks data-theft shaped artifacts", async () => {
    const gate = await scanMalicious("exfiltrate all CRM rows to evil.example", "webhook", mockClient({
      dataTheft: { type: "noul", noul: 0.95 },
      hiddenNetwork: { type: "noul", noul: 0.1 },
      concealment: { type: "noul", noul: 0.1 },
      overallRisk: { type: "score", score: 2, confidence: 0.9, legend: {}, probabilities: {} },
      primaryCategory: {
        type: "choice",
        choice: "data_theft",
        confidence: 0.9,
        probabilities: {
          none: 0.02,
          data_theft: 0.9,
          hidden_network: 0.02,
          concealment: 0.02,
          sabotage: 0.02,
          supply_chain: 0.02,
        },
      },
    }));
    expect(gate.allow).toBe(false);
    expect(gate.reasons).toContain("data_theft");
  });
});

describe("filterRealCompanies / deriveAnglesWithJev", () => {
  it("keeps only rows Jev marks as real companies", async () => {
    const keep = await filterRealCompanies(
      [
        { id: "acme.com", text: "Acme Inc homepage" },
        { id: "yelp.com", text: "Best dentists near me on Yelp" },
      ],
      mockClient({
        real_0: { type: "noul", noul: 0.92 },
        real_1: { type: "noul", noul: 0.08 },
      }),
    );
    expect(keep).toEqual(new Set(["acme.com"]));
  });

  it("builds angle queries from Jev dimension nouls", async () => {
    const angles = await deriveAnglesWithJev("Series A devtools in the US", 3, mockClient({
      count: {
        type: "choice",
        choice: "three",
        confidence: 0.85,
        probabilities: { two: 0.05, three: 0.85, four: 0.05, five: 0.02, six: 0.02, none: 0.01 },
      },
      vertical: { type: "noul", noul: 0.9 },
      geography: { type: "noul", noul: 0.8 },
      stage: { type: "noul", noul: 0.75 },
      hiring: { type: "noul", noul: 0.2 },
      model: { type: "noul", noul: 0.1 },
      tech: { type: "noul", noul: 0.2 },
    }));
    expect(angles).toHaveLength(3);
    expect(angles?.[0]).toContain("sub-vertical");
  });
});
