// VerifiedStrip - "Visible Trust" as a headline, not a footnote. Every enriched
// field already carries provenance (who supplied it, how confident, how fresh);
// this rolls that up into one glanceable statement at the top of a record:
// "N facts verified from M sources, freshest 2 days ago." It turns the quiet
// per-field pills into a felt reason to trust the data. Pure render, server-safe.

type ProvenanceEntry = {
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

function sourceName(slug: string): string {
  return SOURCE_NAMES[slug] ?? slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeAge(d: Date): string {
  const ms = Date.now() - d.getTime();
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

export function VerifiedStrip({
  provenance,
}: {
  provenance: Record<string, ProvenanceEntry>;
}) {
  const entries = Object.values(provenance);
  if (entries.length === 0) return null;

  const fieldCount = entries.length;
  const sources = [...new Set(entries.map((e) => e.source))];
  const freshest = entries.reduce((a, e) => (e.retrievedAt > a ? e.retrievedAt : a), entries[0].retrievedAt);
  const staleCount = entries.filter((e) => e.stale).length;
  // Average confidence, rounded - a single honest number for "how sure".
  const avgConfidence = Math.round(entries.reduce((s, e) => s + e.confidence, 0) / fieldCount);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          {/* A small verified tick, drawn - not an icon-in-a-box badge (design rule). */}
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary" fill="none" aria-hidden>
            <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium text-foreground">
            {fieldCount} {fieldCount === 1 ? "fact" : "facts"} verified
          </span>
        </div>

        <span className="text-sm text-muted-foreground">
          from{" "}
          {sources.slice(0, 4).map((s, i) => (
            <span key={s} className="text-foreground">
              {sourceName(s)}
              {i < Math.min(sources.length, 4) - 1 ? ", " : ""}
            </span>
          ))}
          {sources.length > 4 ? ` +${sources.length - 4} more` : ""}
        </span>

        <span className="text-sm text-muted-foreground">
          freshest <span className="text-foreground">{relativeAge(freshest)}</span>
        </span>

        <span className="ml-auto flex items-center gap-3 text-xs">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
            {avgConfidence}% avg confidence
          </span>
          {staleCount > 0 && (
            <span className="text-muted-foreground">{staleCount} due for re-check</span>
          )}
        </span>
      </div>
    </div>
  );
}
