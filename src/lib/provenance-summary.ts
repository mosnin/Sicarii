// Pure rollup + formatting for the Visible-Trust strip. Kept out of the
// component so the "N facts verified from M sources, freshest X ago, K%
// confidence" math is unit-testable rather than verified-by-eye.

export type ProvenanceEntry = {
  source: string;
  confidence: number;
  retrievedAt: Date;
  verifiedAt: Date | null;
  stale: boolean;
};

// Provider slug -> display name. Unknown slugs are title-cased.
const SOURCE_NAMES: Record<string, string> = {
  explorium: "Explorium",
  pipe0: "Pipe0",
  exa: "Exa",
  linkup: "Linkup",
  apify: "Apify",
  firecrawl: "Firecrawl",
  gleif: "GLEIF",
  companies_house: "Companies House",
  sec_edgar: "SEC EDGAR",
  anymailfinder: "Anymailfinder",
  findymail: "Findymail",
  bouncer: "Bouncer",
  manual: "You",
  derived: "Site analysis",
  inferred: "Inferred",
};

export function sourceName(slug: string): string {
  return SOURCE_NAMES[slug] ?? slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Human "how fresh" from a timestamp. `now` is injectable for deterministic tests.
export function relativeAge(d: Date, now: number = Date.now()): string {
  const ms = now - d.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor(ms / 3_600_000);
    if (hours <= 0) return "just now";
    return `${hours}h ago`;
  }
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export type ProvenanceSummary = {
  fieldCount: number;
  sources: string[]; // distinct source slugs, in first-seen order
  freshest: Date;
  staleCount: number;
  avgConfidence: number; // 0-100, rounded
} | null;

// Roll a provenance map into the one-line trust headline's inputs. Null when
// there is nothing to summarize.
export function summarizeProvenance(entries: ProvenanceEntry[]): ProvenanceSummary {
  if (entries.length === 0) return null;
  const sources = [...new Set(entries.map((e) => e.source))];
  const freshest = entries.reduce((a, e) => (e.retrievedAt > a ? e.retrievedAt : a), entries[0].retrievedAt);
  const staleCount = entries.filter((e) => e.stale).length;
  const avgConfidence = Math.round(entries.reduce((s, e) => s + e.confidence, 0) / entries.length);
  return { fieldCount: entries.length, sources, freshest, staleCount, avgConfidence };
}
