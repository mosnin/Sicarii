// Tests for the evidence ledger's arithmetic. Pure module, no DB, no mocks.
//
// The properties under test are the ones that stop an agent talking a weak
// claim onto a real person's record: noisy-OR combination, the contradiction
// clamp, VERIFIED needing a source that identifies the record, and the dedupe
// that makes one page count once.

import { describe, it, expect } from "vitest";
import {
  scoreEvidence,
  dedupeEvidence,
  rationaleFor,
  isEvidenceKind,
  isPrimaryKind,
  EVIDENCE_KINDS,
  EVIDENCE_KIND_NAMES,
  MAX_SCORE,
  CONTRADICTION_CLAMP,
  BAND_FLOORS,
  type EvidenceEntry,
  type EvidenceKind,
} from "@/lib/evidence";

const e = (kind: EvidenceKind, detail?: string, sourceUrl?: string): EvidenceEntry => ({
  kind,
  detail,
  sourceUrl,
});

const SUPPORTING = EVIDENCE_KIND_NAMES.filter(
  (k) => !EVIDENCE_KINDS[k].primary && k !== "contradiction",
);
const PRIMARY = EVIDENCE_KIND_NAMES.filter((k) => EVIDENCE_KINDS[k].primary);

// ── The price list itself ────────────────────────────────────────────────────

describe("EVIDENCE_KINDS", () => {
  it("every weight is a probability", () => {
    for (const [k, spec] of Object.entries(EVIDENCE_KINDS)) {
      expect(spec.weight, k).toBeGreaterThanOrEqual(0);
      expect(spec.weight, k).toBeLessThanOrEqual(1);
    }
  });

  it("contradiction carries no weight of its own (it is handled by the clamp)", () => {
    expect(EVIDENCE_KINDS.contradiction.weight).toBe(0);
    expect(EVIDENCE_KINDS.contradiction.primary).toBe(false);
  });

  it("every primary kind outweighs every supporting kind", () => {
    const weakestPrimary = Math.min(...PRIMARY.map((k) => EVIDENCE_KINDS[k].weight));
    const strongestSupporting = Math.max(...SUPPORTING.map((k) => EVIDENCE_KINDS[k].weight));
    expect(weakestPrimary).toBeGreaterThan(strongestSupporting);
  });

  it("isEvidenceKind rejects anything not on the list", () => {
    expect(isEvidenceKind("profile.email-match")).toBe(true);
    expect(isEvidenceKind("vibes")).toBe(false);
    expect(isEvidenceKind("toString")).toBe(false); // no prototype leakage
  });
});

// ── Noisy-OR arithmetic ──────────────────────────────────────────────────────

describe("noisy-OR combination", () => {
  it("a single entry scores exactly its own weight", () => {
    expect(scoreEvidence([e("crm.signature-block")]).score).toBeCloseTo(0.8, 10);
    expect(scoreEvidence([e("employer-only")]).score).toBeCloseTo(0.2, 10);
  });

  it("two entries combine as 1 - (1-a)(1-b)", () => {
    // 1 - 0.6 * 0.65 = 0.61
    const v = scoreEvidence([e("web.cited-claim"), e("search.cites-profile")]);
    expect(v.score).toBeCloseTo(0.61, 10);
  });

  it("three entries combine as 1 - product of the misses", () => {
    // 1 - 0.3 * 0.6 * 0.65 = 0.883
    const v = scoreEvidence([
      e("crm.meeting-attendance"),
      e("web.cited-claim"),
      e("search.cites-profile"),
    ]);
    expect(v.score).toBeCloseTo(0.883, 10);
  });

  it("is order independent", () => {
    const a = scoreEvidence([e("crm.signature-block"), e("employer-only"), e("web.cited-claim")]);
    const b = scoreEvidence([e("web.cited-claim"), e("crm.signature-block"), e("employer-only")]);
    expect(a.score).toBeCloseTo(b.score, 12);
  });

  it("caps at MAX_SCORE, so nothing is ever certain", () => {
    const v = scoreEvidence(PRIMARY.map((k) => e(k)));
    expect(v.score).toBe(MAX_SCORE);
    expect(v.score).toBeLessThan(1);
  });

  it("no evidence scores zero and records nothing", () => {
    const v = scoreEvidence([]);
    expect(v.score).toBe(0);
    expect(v.band).toBeNull();
    expect(v.rationale).toBe("No usable evidence was recorded.");
  });
});

// ── The contradiction clamp ──────────────────────────────────────────────────

describe("contradiction clamp", () => {
  it("clamps an otherwise near-certain claim to CONTRADICTION_CLAMP", () => {
    const clean = scoreEvidence([e("profile.email-match")]);
    expect(clean.score).toBeCloseTo(0.95, 10);

    const disputed = scoreEvidence([e("profile.email-match"), e("contradiction")]);
    expect(disputed.score).toBe(CONTRADICTION_CLAMP);
    expect(disputed.contradicted).toBe(true);
  });

  it("does not degrade gradually with more agreeing sources", () => {
    // Piling on agreement cannot outvote the source that says otherwise.
    const two = scoreEvidence([e("profile.email-match"), e("registry.filing"), e("contradiction")]);
    const four = scoreEvidence([
      e("profile.email-match"),
      e("registry.filing"),
      e("crm.thread-reply"),
      e("crm.signature-block"),
      e("contradiction"),
    ]);
    expect(two.score).toBe(CONTRADICTION_CLAMP);
    expect(four.score).toBe(CONTRADICTION_CLAMP);
  });

  it("a disputed claim can never be VERIFIED, however strong its sources", () => {
    const v = scoreEvidence([e("profile.email-match"), e("registry.filing"), e("contradiction")]);
    expect(v.hasPrimary).toBe(true);
    expect(v.band).toBe("POSSIBLE");
    expect(CONTRADICTION_CLAMP).toBeLessThan(BAND_FLOORS.PROBABLE);
  });

  it("clamps down only: weak-and-disputed stays weak and falls out entirely", () => {
    const v = scoreEvidence([e("employer-only"), e("contradiction")]);
    expect(v.score).toBeCloseTo(0.2, 10);
    expect(v.band).toBeNull();
  });

  it("a contradiction on its own records nothing", () => {
    const v = scoreEvidence([e("contradiction")]);
    expect(v.score).toBe(0);
    expect(v.band).toBeNull();
  });
});

// ── Banding, and the primary-source requirement ──────────────────────────────

describe("bands", () => {
  it("VERIFIED needs both the score AND a primary source", () => {
    const v = scoreEvidence([e("linkedin.employer-and-name")]);
    expect(v.score).toBeCloseTo(0.85, 10);
    expect(v.hasPrimary).toBe(true);
    expect(v.band).toBe("VERIFIED");
  });

  it("no stack of supporting-only evidence can ever reach VERIFIED", () => {
    // Exhaustive over every subset of the supporting kinds: corroboration
    // without identification is still about nobody in particular.
    for (let mask = 1; mask < 1 << SUPPORTING.length; mask++) {
      const subset = SUPPORTING.filter((_, i) => mask & (1 << i)).map((k) => e(k));
      const v = scoreEvidence(subset);
      expect(v.hasPrimary, JSON.stringify(subset)).toBe(false);
      expect(v.band, JSON.stringify(subset)).not.toBe("VERIFIED");
    }
  });

  it("the strongest supporting-only stack lands at PROBABLE, not VERIFIED", () => {
    const v = scoreEvidence(SUPPORTING.map((k) => e(k)));
    // 1 - 0.6 * 0.65 * 0.65 * 0.8 = 0.7972
    expect(v.score).toBeCloseTo(0.7972, 10);
    expect(v.band).toBe("PROBABLE");
  });

  it("the same score WITH a primary source is VERIFIED", () => {
    const v = scoreEvidence([
      e("crm.meeting-attendance"),
      e("web.cited-claim"),
      e("search.cites-profile"),
    ]);
    expect(v.score).toBeCloseTo(0.883, 10);
    expect(v.band).toBe("VERIFIED");
  });

  it("steps down through PROBABLE, POSSIBLE, then nothing", () => {
    expect(scoreEvidence([e("email.verified-deliverable")]).band).toBe("PROBABLE"); // 0.75
    expect(scoreEvidence([e("web.cited-claim")]).band).toBe("POSSIBLE"); // 0.40
    expect(scoreEvidence([e("employer-only")]).band).toBeNull(); // 0.20
  });

  it("a lone primary below the VERIFIED floor is only PROBABLE", () => {
    const v = scoreEvidence([e("crm.meeting-attendance")]); // 0.70
    expect(v.hasPrimary).toBe(true);
    expect(v.band).toBe("PROBABLE");
  });

  it("band floors are ordered", () => {
    expect(BAND_FLOORS.VERIFIED).toBeGreaterThan(BAND_FLOORS.PROBABLE);
    expect(BAND_FLOORS.PROBABLE).toBeGreaterThan(BAND_FLOORS.POSSIBLE);
  });
});

// ── Dedupe: one page is one observation ──────────────────────────────────────

describe("dedupeEvidence", () => {
  it("collapses repeats of the same kind, keeping the first", () => {
    const out = dedupeEvidence([
      e("web.cited-claim", "first"),
      e("web.cited-claim", "second"),
      e("web.cited-claim", "third"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].detail).toBe("first");
  });

  it("stops split observations from manufacturing certainty", () => {
    const honest = scoreEvidence([e("web.cited-claim")]);
    const padded = scoreEvidence([
      e("web.cited-claim", "the headline"),
      e("web.cited-claim", "the byline"),
      e("web.cited-claim", "the footer"),
    ]);
    expect(padded.score).toBe(honest.score);
    expect(padded.evidence).toHaveLength(1);
  });

  it("keeps distinct kinds", () => {
    const out = dedupeEvidence([
      e("web.cited-claim"),
      e("search.cites-profile"),
      e("web.cited-claim"),
    ]);
    expect(out.map((x) => x.kind)).toEqual(["web.cited-claim", "search.cites-profile"]);
  });

  it("drops unknown kinds instead of scoring them", () => {
    const out = dedupeEvidence([
      { kind: "made.up" as EvidenceKind },
      e("registry.filing"),
    ]);
    expect(out.map((x) => x.kind)).toEqual(["registry.filing"]);
  });

  it("normalizes blank detail and sourceUrl to null", () => {
    const out = dedupeEvidence([e("registry.filing", "   ", "  ")]);
    expect(out[0].detail).toBeNull();
    expect(out[0].sourceUrl).toBeNull();
  });

  it("scoreEvidence returns the deduped evidence it actually priced", () => {
    const v = scoreEvidence([e("handle.name-form"), e("handle.name-form")]);
    expect(v.evidence).toHaveLength(1);
  });
});

// ── Rationale ────────────────────────────────────────────────────────────────

describe("rationale", () => {
  it("names each source and folds in the observer's detail", () => {
    const v = scoreEvidence([
      e("crm.signature-block", "their signature on 14 July reads Head of Security, Acme"),
      e("employer-only"),
    ]);
    expect(v.rationale).toContain("signature block");
    expect(v.rationale).toContain("14 July");
    expect(v.rationale).toContain("2 independent sources agree");
    expect(v.rationale).toContain("probable");
  });

  it("says plainly when sources disagree", () => {
    const v = scoreEvidence([e("registry.filing"), e("contradiction")]);
    expect(v.rationale).toContain("Sources disagree");
    expect(v.rationale).toContain("0.45");
  });

  it("says when there is not enough to record", () => {
    const v = scoreEvidence([e("employer-only")]);
    expect(v.rationale).toContain("too thin to record");
  });

  it("uses the singular for one source", () => {
    expect(scoreEvidence([e("registry.filing")]).rationale).toContain("One source:");
  });

  it("is callable standalone for stored rows", () => {
    const text = rationaleFor([e("registry.filing")], 0.9, "VERIFIED");
    expect(text).toContain("registry filing");
    expect(text).toContain("verified");
  });

  it("never uses a long dash (house copy rule)", () => {
    for (const kind of EVIDENCE_KIND_NAMES) {
      expect(EVIDENCE_KINDS[kind].label, kind).not.toMatch(/[\u2013\u2014]/);
    }
    const v = scoreEvidence([e("registry.filing"), e("contradiction")]);
    expect(v.rationale).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("isPrimaryKind", () => {
  it("agrees with the price list", () => {
    expect(isPrimaryKind("registry.filing")).toBe(true);
    expect(isPrimaryKind("employer-only")).toBe(false);
  });
});
