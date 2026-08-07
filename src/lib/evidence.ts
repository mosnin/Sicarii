// The evidence ledger - pure scoring, no I/O.
//
// The old model (src/lib/provenance.ts CONFIDENCE) gave every provider a flat
// number: explorium 90, bouncer 92. That is a reputation score for the SOURCE,
// not a measure of whether THIS claim about THIS person is true. It cannot say
// "two independent sources agree", it cannot say "these two disagree", and
// because a single number has to be either good enough to write or thrown
// away, everything ambiguous got discarded.
//
// So the agent no longer supplies a confidence at all. It reports what it
// OBSERVED, as typed evidence kinds, and this module prices the observation.
// That inversion is the whole point: an agent that wants a claim to land
// cannot simply assert a higher number, it has to have actually seen more.
//
// Two rules do the heavy lifting:
//   - PRIMARY vs SUPPORTING. A primary kind ties the value to THIS specific
//     person or company (their reply, their signature, a statutory filing).
//     A supporting kind is only consistent with it (a handle that looks like
//     their name). Corroboration alone never reaches VERIFIED, because ten
//     weak coincidences are still a coincidence. See AGENTS.md: prefer nothing
//     over a wrong value.
//   - Independence. Weights combine with noisy-OR, which assumes each entry is
//     an independent look at the world. Two facts scraped off one page are ONE
//     observation, so callers dedupe by kind before scoring (dedupeEvidence).

/** A single observation. `detail` is prose a human reads in the review queue;
 *  `sourceUrl` is where it was seen. */
export interface EvidenceEntry {
  kind: EvidenceKind;
  detail?: string | null;
  sourceUrl?: string | null;
}

interface EvidenceSpec {
  /** Probability this observation alone makes the claim true, 0 to 1. */
  weight: number;
  /** Can this kind carry a fact on its own (does it tie to THIS record)? */
  primary: boolean;
  /** Human phrase for the rationale tooltip. Lowercase, no trailing period. */
  label: string;
}

/**
 * The fixed price list. Weights are deliberately not configurable: a tunable
 * weight is a tunable truth, and the first thing anyone would tune is the one
 * blocking the fact they wanted to write.
 */
export const EVIDENCE_KINDS = {
  // ── PRIMARY: identifies this exact person or company ──────────────────────
  "profile.email-match": {
    weight: 0.95,
    primary: true,
    label: "the email on the source profile matches the address already on file",
  },
  "registry.filing": {
    weight: 0.9,
    primary: true,
    label: "an official registry filing (Companies House, GLEIF or SEC EDGAR)",
  },
  "linkedin.employer-and-name": {
    weight: 0.85,
    primary: true,
    label: "a LinkedIn profile matching both the person's name and their employer",
  },
  "crm.thread-reply": {
    weight: 0.85,
    primary: true,
    label: "the person replied from this address on a thread in your own CRM",
  },
  "crm.signature-block": {
    weight: 0.8,
    primary: true,
    label: "an email signature block in your own CRM history",
  },
  "email.verified-deliverable": {
    weight: 0.75,
    primary: true,
    label: "the mailbox verified as deliverable",
  },
  "crm.meeting-attendance": {
    weight: 0.7,
    primary: true,
    label: "the person attended a calendar meeting under this address",
  },

  // ── SUPPORTING: consistent with the claim, but ties to nobody in particular ─
  "web.cited-claim": {
    weight: 0.4,
    primary: false,
    label: "a claim on a public page that cites where it came from",
  },
  "search.cites-profile": {
    weight: 0.35,
    primary: false,
    label: "a search result pointing at the person's profile",
  },
  "handle.name-form": {
    weight: 0.35,
    primary: false,
    label: "a social handle built out of the person's name",
  },
  "employer-only": {
    weight: 0.2,
    primary: false,
    label: "the employer matches, but nothing ties this specific person to it",
  },

  // ── The dissent ───────────────────────────────────────────────────────────
  // Weight 0 because it does not participate in noisy-OR at all; it is handled
  // by the clamp below.
  contradiction: {
    weight: 0,
    primary: false,
    label: "another source disagrees with this value",
  },
} as const satisfies Record<string, EvidenceSpec>;

export type EvidenceKind = keyof typeof EVIDENCE_KINDS;

/** Every kind name, as a tuple, so callers can build a zod enum from it. */
export const EVIDENCE_KIND_NAMES = Object.keys(EVIDENCE_KINDS) as [
  EvidenceKind,
  ...EvidenceKind[],
];

export const CONTRADICTION_KIND: EvidenceKind = "contradiction";

/** Noisy-OR can asymptote to 1. Nothing is certain, so cap below it. */
export const MAX_SCORE = 0.99;

/**
 * A contradiction does NOT shave points off gradually. Two sources disagreeing
 * is not "60% true", it is UNRESOLVED, and the honest thing to do with an
 * unresolved claim is hand it to a human rather than let a pile of agreeing
 * sources outvote the one that says otherwise. 0.45 sits deliberately below
 * PROBABLE: high enough to keep the claim visible in the review queue, too low
 * to ever write itself onto a record.
 */
export const CONTRADICTION_CLAMP = 0.45;

export type FactBandName = "VERIFIED" | "PROBABLE" | "POSSIBLE";

/** Floors for each band. VERIFIED additionally requires a primary source. */
export const BAND_FLOORS = {
  VERIFIED: 0.85,
  PROBABLE: 0.55,
  POSSIBLE: 0.3,
} as const;

export interface Verdict {
  /** 0 to MAX_SCORE. */
  score: number;
  /** null means "not worth recording at all". */
  band: FactBandName | null;
  /** At least one primary kind survived the dedupe. */
  hasPrimary: boolean;
  /** A source explicitly disagreed. */
  contradicted: boolean;
  /** The deduped entries, in the order they were first seen. */
  evidence: EvidenceEntry[];
  /** Human-readable explanation, for the review queue tooltip. */
  rationale: string;
}

export function isEvidenceKind(kind: string): kind is EvidenceKind {
  return Object.prototype.hasOwnProperty.call(EVIDENCE_KINDS, kind);
}

/** True when this kind can carry a fact on its own. */
export function isPrimaryKind(kind: EvidenceKind): boolean {
  return EVIDENCE_KINDS[kind].primary;
}

/**
 * Collapse to one entry per kind, keeping the first occurrence.
 *
 * This is the anti-double-counting rule and it is load-bearing. Noisy-OR
 * assumes independence, so two `web.cited-claim` entries read off the same
 * article would multiply into a certainty that nobody actually observed. An
 * agent splitting one page into three "sources" is the exact failure mode this
 * ledger exists to prevent, and it is cheaper to make the arithmetic immune
 * than to police the agent.
 */
export function dedupeEvidence(entries: EvidenceEntry[]): EvidenceEntry[] {
  const seen = new Set<EvidenceKind>();
  const out: EvidenceEntry[] = [];
  for (const entry of entries) {
    if (!entry || !isEvidenceKind(entry.kind) || seen.has(entry.kind)) continue;
    seen.add(entry.kind);
    out.push({
      kind: entry.kind,
      detail: entry.detail?.trim() || null,
      sourceUrl: entry.sourceUrl?.trim() || null,
    });
  }
  return out;
}

/** Noisy-OR: the chance that at least one independent observation is right. */
function noisyOr(weights: number[]): number {
  const missAll = weights.reduce((acc, w) => acc * (1 - w), 1);
  return 1 - missAll;
}

function bandFor(score: number, hasPrimary: boolean): FactBandName | null {
  // VERIFIED is the only band that writes to a record, so it needs a source
  // that actually identified the person. A stack of supporting evidence can
  // reach 0.85 arithmetically and still be about nobody in particular.
  if (score >= BAND_FLOORS.VERIFIED && hasPrimary) return "VERIFIED";
  if (score >= BAND_FLOORS.PROBABLE) return "PROBABLE";
  if (score >= BAND_FLOORS.POSSIBLE) return "POSSIBLE";
  return null;
}

/**
 * Human-readable explanation of a verdict, built from the evidence labels plus
 * whatever `detail` the observer wrote. Rendered in the review queue so a
 * person can disagree with the machine on the machine's own terms.
 */
export function rationaleFor(
  entries: EvidenceEntry[],
  score: number,
  band: FactBandName | null,
): string {
  const deduped = dedupeEvidence(entries);
  if (deduped.length === 0) return "No usable evidence was recorded.";

  const contradicted = deduped.some((e) => e.kind === CONTRADICTION_KIND);
  const supporting = deduped.filter((e) => e.kind !== CONTRADICTION_KIND);

  const parts = deduped.map((e) => {
    const label = EVIDENCE_KINDS[e.kind].label;
    return e.detail ? `${label} (${e.detail})` : label;
  });

  let lead: string;
  if (contradicted) {
    lead = "Sources disagree, so this is held unresolved.";
  } else if (supporting.length === 1) {
    lead = "One source:";
  } else {
    lead = `${supporting.length} independent sources agree:`;
  }

  const verdict = band
    ? `Score ${score.toFixed(2)}, ${band.toLowerCase()}.`
    : `Score ${score.toFixed(2)}, too thin to record.`;

  return `${lead} ${parts.join("; ")}. ${verdict}`;
}

/**
 * Price a set of observations. This is the only place a confidence number is
 * ever produced in Scalar's fact path.
 */
export function scoreEvidence(entries: EvidenceEntry[]): Verdict {
  const evidence = dedupeEvidence(entries);
  const contradicted = evidence.some((e) => e.kind === CONTRADICTION_KIND);
  const hasPrimary = evidence.some((e) => isPrimaryKind(e.kind));

  const raw = Math.min(
    noisyOr(evidence.map((e) => EVIDENCE_KINDS[e.kind].weight)),
    MAX_SCORE,
  );

  // Clamp DOWN only. A contradiction can never improve a claim's standing, so
  // weak-and-disputed stays weak (and falls out of the ledger entirely) rather
  // than being lifted to 0.45 by the mere fact that someone objected.
  const score = contradicted ? Math.min(raw, CONTRADICTION_CLAMP) : raw;

  const band = bandFor(score, hasPrimary);

  return {
    score,
    band,
    hasPrimary,
    contradicted,
    evidence,
    rationale: rationaleFor(evidence, score, band),
  };
}
