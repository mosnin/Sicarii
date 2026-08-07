// Tests for the evidence-ledger ops layer: the routing decision (write vs
// suggest vs discard), supersede-on-rewrite, kind dedupe surviving into the
// stored row, and tenant isolation on the human decision paths.
//
// The record write is the dangerous side effect here, so several tests assert
// a NEGATIVE: that contact.updateMany was never called. A proposed fact that
// quietly edits the record would defeat the entire feature.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpError } from "@/lib/op-error";

const OWNER = "user-A";
const ATTACKER = "user-B";
const CONTACT_ID = "c1";
const ENTITY_ID = "e1";
const FACT_ID = "f1";

const h = vi.hoisted(() => ({
  contactFindUnique: vi.fn(),
  contactFindMany: vi.fn(),
  contactUpdateMany: vi.fn(),
  entityFindUnique: vi.fn(),
  entityFindMany: vi.fn(),
  entityUpdateMany: vi.fn(),
  factCreate: vi.fn(),
  factUpdate: vi.fn(),
  factUpdateMany: vi.fn(),
  factFindUnique: vi.fn(),
  factFindMany: vi.fn(),
  recordProvenance: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    contact: { updateMany: h.contactUpdateMany },
    entity: { updateMany: h.entityUpdateMany },
    recordFact: { create: h.factCreate, update: h.factUpdate, updateMany: h.factUpdateMany },
  };
  return {
    prisma: {
      contact: {
        findUnique: h.contactFindUnique,
        findMany: h.contactFindMany,
        updateMany: h.contactUpdateMany,
      },
      entity: {
        findUnique: h.entityFindUnique,
        findMany: h.entityFindMany,
        updateMany: h.entityUpdateMany,
      },
      recordFact: {
        create: h.factCreate,
        update: h.factUpdate,
        updateMany: h.factUpdateMany,
        findUnique: h.factFindUnique,
        findMany: h.factFindMany,
      },
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});

// recordProvenance is the bridge that keeps the existing "via <source>, 3d ago"
// chips working; stub it so we can assert it fires only on an applied fact.
vi.mock("@/lib/provenance", () => ({
  recordProvenance: h.recordProvenance,
  recordProvenanceBulk: vi.fn(),
  CONFIDENCE: {},
}));

import { recordFact, applyFact, dismissFact, listProposedFacts, getFactEvidence } from "@/lib/facts";

/** Evidence that clears VERIFIED from a primary source (0.95). */
const STRONG = [{ kind: "profile.email-match" as const, detail: "the profile lists jordan@acme.com" }];
/** Evidence that lands in PROBABLE with no primary source (0.61). */
const MIDDLING = [
  { kind: "web.cited-claim" as const, detail: "a conference bio citing the company page" },
  { kind: "search.cites-profile" as const },
];
/** Evidence too thin to store at all (0.20). */
const THIN = [{ kind: "employer-only" as const }];

beforeEach(() => {
  vi.clearAllMocks();
  h.contactFindUnique.mockResolvedValue({ userId: OWNER });
  h.entityFindUnique.mockResolvedValue({ userId: OWNER });
  h.contactUpdateMany.mockResolvedValue({ count: 1 });
  h.entityUpdateMany.mockResolvedValue({ count: 1 });
  h.factUpdateMany.mockResolvedValue({ count: 0 });
  h.factCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: FACT_ID,
    ...data,
  }));
  h.factUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: FACT_ID,
    ...data,
  }));
  h.recordProvenance.mockResolvedValue(undefined);
});

// ── Outcome routing ──────────────────────────────────────────────────────────

describe("recordFact routing", () => {
  it("VERIFIED from a primary source writes the record and logs APPLIED", async () => {
    const res = await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      evidence: STRONG,
      method: "linkedin-lookup",
    });

    expect(res.stored).toBe(true);
    expect(res.applied).toBe(true);
    expect(res.band).toBe("VERIFIED");
    expect(res.status).toBe("APPLIED");

    expect(h.contactUpdateMany).toHaveBeenCalledOnce();
    const write = h.contactUpdateMany.mock.calls[0][0];
    expect(write.where).toEqual({ id: CONTACT_ID, userId: OWNER });
    expect(write.data).toEqual({ email: "jordan@acme.com" });

    expect(h.factCreate.mock.calls[0][0].data.status).toBe("APPLIED");
  });

  it("mirrors an applied fact into FieldProvenance so the existing chips keep working", async () => {
    await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      evidence: STRONG,
      method: "linkedin-lookup",
    });
    expect(h.recordProvenance).toHaveBeenCalledOnce();
    expect(h.recordProvenance.mock.calls[0][0]).toMatchObject({
      recordType: "contact",
      recordId: CONTACT_ID,
      field: "email",
      source: "linkedin-lookup",
      confidence: 95,
    });
  });

  it("a non-VERIFIED band is PROPOSED and never touches the record", async () => {
    const res = await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "title",
      value: "Head of Security",
      evidence: MIDDLING,
      method: "site-crawl",
    });

    expect(res.stored).toBe(true);
    expect(res.applied).toBe(false);
    expect(res.status).toBe("PROPOSED");
    expect(res.band).toBe("PROBABLE");

    expect(h.factCreate).toHaveBeenCalledOnce();
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
    expect(h.recordProvenance).not.toHaveBeenCalled();
  });

  it("a high score with no primary source is still only a suggestion", async () => {
    const res = await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "title",
      value: "Head of Security",
      evidence: [
        { kind: "web.cited-claim" },
        { kind: "search.cites-profile" },
        { kind: "handle.name-form" },
        { kind: "employer-only" },
      ],
      method: "site-crawl",
    });
    expect(res.score).toBeCloseTo(0.7972, 6);
    expect(res.applied).toBe(false);
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
  });

  it("a contradicted claim is held for a human, however strong its sources", async () => {
    const res = await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      evidence: [...STRONG, { kind: "contradiction", detail: "the CRM signature says jlee@acme.com" }],
      method: "linkedin-lookup",
    });
    expect(res.score).toBe(0.45);
    expect(res.status).toBe("PROPOSED");
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
  });

  it("a band of null stores nothing at all", async () => {
    const res = await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "title",
      value: "Head of Security",
      evidence: THIN,
      method: "guess",
    });
    expect(res.stored).toBe(false);
    expect(res.factId).toBeNull();
    expect(res.reason).toBeTruthy();
    expect(h.factCreate).not.toHaveBeenCalled();
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
  });

  it("routes entity facts to the entity table", async () => {
    await recordFact(OWNER, {
      recordType: "ENTITY",
      recordId: ENTITY_ID,
      field: "industry",
      value: "Marine logistics",
      evidence: [{ kind: "registry.filing", detail: "SIC 52102 on the 2024 filing" }],
      method: "companies-house",
    });
    expect(h.entityUpdateMany).toHaveBeenCalledOnce();
    expect(h.entityUpdateMany.mock.calls[0][0].data).toEqual({ industry: "Marine logistics" });
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
  });
});

// ── Dedupe reaching the stored row ───────────────────────────────────────────

describe("evidence dedupe", () => {
  it("stores one entry per kind, so a padded observation scores as one", async () => {
    const res = await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "title",
      value: "Head of Security",
      evidence: [
        { kind: "web.cited-claim", detail: "the headline" },
        { kind: "web.cited-claim", detail: "the byline" },
        { kind: "web.cited-claim", detail: "the footer" },
      ],
      method: "site-crawl",
    });
    expect(res.score).toBeCloseTo(0.4, 10);
    const stored = h.factCreate.mock.calls[0][0].data.evidence as unknown[];
    expect(stored).toHaveLength(1);
  });

  it("splitting one page into three cannot reach the record", async () => {
    // 1 - 0.6^3 = 0.784 if double-counted, which would clear PROBABLE but
    // still not VERIFIED; the point is that it scores 0.4 either way.
    const res = await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "title",
      value: "Head of Security",
      evidence: [
        { kind: "web.cited-claim" },
        { kind: "web.cited-claim" },
        { kind: "web.cited-claim" },
      ],
      method: "site-crawl",
    });
    expect(res.band).toBe("POSSIBLE");
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects an invented evidence kind instead of ignoring it", async () => {
    await expect(
      recordFact(OWNER, {
        recordType: "CONTACT",
        recordId: CONTACT_ID,
        field: "title",
        value: "Head of Security",
        // @ts-expect-error deliberately invalid kind from an agent
        evidence: [{ kind: "seems-right" }],
        method: "vibes",
      }),
    ).rejects.toBeInstanceOf(OpError);
    expect(h.factCreate).not.toHaveBeenCalled();
  });
});

// ── Supersede on rewrite ─────────────────────────────────────────────────────

describe("supersede on rewrite", () => {
  it("retires the previous live fact for the same field, in the same transaction", async () => {
    await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      evidence: STRONG,
      method: "linkedin-lookup",
    });

    expect(h.factUpdateMany).toHaveBeenCalledOnce();
    const call = h.factUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      userId: OWNER,
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      status: { in: ["APPLIED", "PROPOSED"] },
    });
    expect(call.data.status).toBe("SUPERSEDED");
    expect(call.data.supersededAt).toBeInstanceOf(Date);
  });

  it("scopes the supersede to one field, never the whole record", async () => {
    await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "phone",
      value: "+441134960000",
      evidence: MIDDLING,
      method: "site-crawl",
    });
    expect(h.factUpdateMany.mock.calls[0][0].where.field).toBe("phone");
  });

  it("applying a suggestion supersedes the other live claims but not itself", async () => {
    h.factFindUnique.mockResolvedValue({
      id: FACT_ID,
      userId: OWNER,
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      score: 0.61,
      band: "PROBABLE",
      status: "PROPOSED",
      method: "site-crawl",
      evidence: [],
    });

    await applyFact(OWNER, FACT_ID, "human-1");

    const where = h.factUpdateMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: FACT_ID });
    expect(h.contactUpdateMany).toHaveBeenCalledOnce();
    expect(h.factUpdate.mock.calls[0][0].data).toMatchObject({
      status: "APPLIED",
      decidedById: "human-1",
    });
  });
});

// ── Field allowlist ──────────────────────────────────────────────────────────

describe("field allowlist", () => {
  it("refuses a field that is not a recordable column", async () => {
    await expect(
      recordFact(OWNER, {
        recordType: "CONTACT",
        recordId: CONTACT_ID,
        field: "creditsRemaining",
        value: "999999",
        evidence: STRONG,
        method: "linkedin-lookup",
      }),
    ).rejects.toBeInstanceOf(OpError);
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
    expect(h.factCreate).not.toHaveBeenCalled();
  });

  it("refuses an entity-only field on a contact", async () => {
    await expect(
      recordFact(OWNER, {
        recordType: "CONTACT",
        recordId: CONTACT_ID,
        field: "industry",
        value: "Marine logistics",
        evidence: STRONG,
        method: "site-crawl",
      }),
    ).rejects.toBeInstanceOf(OpError);
  });

  it("refuses an empty value", async () => {
    await expect(
      recordFact(OWNER, {
        recordType: "CONTACT",
        recordId: CONTACT_ID,
        field: "email",
        value: "   ",
        evidence: STRONG,
        method: "linkedin-lookup",
      }),
    ).rejects.toBeInstanceOf(OpError);
  });

  it("refuses a fact with no evidence at all", async () => {
    await expect(
      recordFact(OWNER, {
        recordType: "CONTACT",
        recordId: CONTACT_ID,
        field: "email",
        value: "jordan@acme.com",
        evidence: [],
        method: "linkedin-lookup",
      }),
    ).rejects.toBeInstanceOf(OpError);
  });
});

// ── Tenant isolation ─────────────────────────────────────────────────────────

describe("tenant isolation", () => {
  it("cannot record a fact against another tenant's contact", async () => {
    h.contactFindUnique.mockResolvedValue({ userId: OWNER });
    await expect(
      recordFact(ATTACKER, {
        recordType: "CONTACT",
        recordId: CONTACT_ID,
        field: "email",
        value: "attacker@evil.test",
        evidence: STRONG,
        method: "linkedin-lookup",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(h.factCreate).not.toHaveBeenCalled();
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
  });

  it("cannot record a fact against another tenant's entity", async () => {
    h.entityFindUnique.mockResolvedValue({ userId: OWNER });
    await expect(
      recordFact(ATTACKER, {
        recordType: "ENTITY",
        recordId: ENTITY_ID,
        field: "industry",
        value: "Marine logistics",
        evidence: [{ kind: "registry.filing" }],
        method: "companies-house",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(h.factCreate).not.toHaveBeenCalled();
  });

  it("cannot APPLY another tenant's fact", async () => {
    h.factFindUnique.mockResolvedValue({
      id: FACT_ID,
      userId: OWNER,
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      score: 0.61,
      band: "PROBABLE",
      status: "PROPOSED",
      method: "site-crawl",
      evidence: [],
    });

    await expect(applyFact(ATTACKER, FACT_ID, ATTACKER)).rejects.toMatchObject({ status: 404 });
    expect(h.factUpdate).not.toHaveBeenCalled();
    expect(h.factUpdateMany).not.toHaveBeenCalled();
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
    expect(h.recordProvenance).not.toHaveBeenCalled();
  });

  it("cannot DISMISS another tenant's fact", async () => {
    h.factFindUnique.mockResolvedValue({
      id: FACT_ID,
      userId: OWNER,
      status: "PROPOSED",
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      score: 0.61,
      band: "PROBABLE",
      method: "site-crawl",
      evidence: [],
    });
    await expect(dismissFact(ATTACKER, FACT_ID, ATTACKER)).rejects.toMatchObject({ status: 404 });
    expect(h.factUpdate).not.toHaveBeenCalled();
  });

  it("cannot READ another tenant's fact evidence", async () => {
    h.factFindUnique.mockResolvedValue({ id: FACT_ID, userId: OWNER, evidence: [] });
    await expect(getFactEvidence(ATTACKER, FACT_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("scopes both the fact write and the record write to the caller's userId", async () => {
    await recordFact(OWNER, {
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      evidence: STRONG,
      method: "linkedin-lookup",
    });
    expect(h.factCreate.mock.calls[0][0].data.userId).toBe(OWNER);
    expect(h.contactUpdateMany.mock.calls[0][0].where.userId).toBe(OWNER);
    expect(h.factUpdateMany.mock.calls[0][0].where.userId).toBe(OWNER);
  });

  it("the review queue only ever reads this tenant's rows", async () => {
    h.factFindMany.mockResolvedValue([]);
    await listProposedFacts(OWNER);
    expect(h.factFindMany.mock.calls[0][0].where).toMatchObject({
      userId: OWNER,
      status: "PROPOSED",
    });
  });
});

// ── Idempotence of the human decision ────────────────────────────────────────

describe("apply and dismiss are idempotent", () => {
  it("re-applying an already applied fact is a no-op", async () => {
    h.factFindUnique.mockResolvedValue({ id: FACT_ID, userId: OWNER, status: "APPLIED", evidence: [] });
    const res = await applyFact(OWNER, FACT_ID, "human-1");
    expect(res.status).toBe("APPLIED");
    expect(h.factUpdate).not.toHaveBeenCalled();
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
  });

  it("re-dismissing an already dismissed fact is a no-op", async () => {
    h.factFindUnique.mockResolvedValue({ id: FACT_ID, userId: OWNER, status: "DISMISSED", evidence: [] });
    const res = await dismissFact(OWNER, FACT_ID, "human-1");
    expect(res.status).toBe("DISMISSED");
    expect(h.factUpdate).not.toHaveBeenCalled();
  });

  it("a superseded fact can no longer be settled", async () => {
    h.factFindUnique.mockResolvedValue({ id: FACT_ID, userId: OWNER, status: "SUPERSEDED", evidence: [] });
    await expect(applyFact(OWNER, FACT_ID, "human-1")).rejects.toMatchObject({ status: 409 });
    await expect(dismissFact(OWNER, FACT_ID, "human-1")).rejects.toMatchObject({ status: 409 });
  });

  it("dismissing never touches the record", async () => {
    h.factFindUnique.mockResolvedValue({
      id: FACT_ID,
      userId: OWNER,
      status: "PROPOSED",
      recordType: "CONTACT",
      recordId: CONTACT_ID,
      field: "email",
      value: "jordan@acme.com",
      score: 0.61,
      band: "PROBABLE",
      method: "site-crawl",
      evidence: [],
    });
    await dismissFact(OWNER, FACT_ID, "human-1");
    expect(h.factUpdate.mock.calls[0][0].data).toMatchObject({
      status: "DISMISSED",
      decidedById: "human-1",
    });
    expect(h.contactUpdateMany).not.toHaveBeenCalled();
    expect(h.recordProvenance).not.toHaveBeenCalled();
  });
});

// ── Review queue shape ───────────────────────────────────────────────────────

describe("listProposedFacts", () => {
  it("shows the current value next to the proposed one, with a rationale", async () => {
    h.factFindMany.mockResolvedValue([
      {
        id: FACT_ID,
        userId: OWNER,
        recordType: "CONTACT",
        recordId: CONTACT_ID,
        field: "title",
        value: "Head of Security",
        score: 0.61,
        band: "PROBABLE",
        method: "site-crawl",
        sourceUrl: null,
        observedAt: new Date("2026-07-14T09:00:00Z"),
        evidence: [
          { kind: "web.cited-claim", detail: "a conference bio", sourceUrl: null },
          { kind: "made.up", detail: "should be dropped", sourceUrl: null },
        ],
      },
    ]);
    h.contactFindMany.mockResolvedValue([
      { id: CONTACT_ID, userId: OWNER, name: "Jordan Lee", title: "VP Sales" },
    ]);

    const [row] = await listProposedFacts(OWNER);
    expect(row.recordName).toBe("Jordan Lee");
    expect(row.currentValue).toBe("VP Sales");
    expect(row.value).toBe("Head of Security");
    // The unknown kind stored on an older row is dropped on read, not rendered.
    expect(row.evidence).toHaveLength(1);
    expect(row.evidence[0].label).toContain("cites where it came from");
    expect(row.rationale).toContain("conference bio");
    // Hydration is tenant-scoped too, not just the fact query.
    expect(h.contactFindMany.mock.calls[0][0].where.userId).toBe(OWNER);
  });

  it("returns an empty list without hydrating anything", async () => {
    h.factFindMany.mockResolvedValue([]);
    expect(await listProposedFacts(OWNER)).toEqual([]);
    expect(h.contactFindMany).not.toHaveBeenCalled();
    expect(h.entityFindMany).not.toHaveBeenCalled();
  });
});
