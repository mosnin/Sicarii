// Provenance pill - shows who supplied a field, how confident, and how fresh.
//
// Design rules (from DESIGN.md / AGENTS.md):
//   - No decorative icons, no tinted-box badges.
//   - Quiet and textual: a small secondary line under the value, shown inline.
//   - Confidence rendered as a plain word (high/medium/low), not a colored chip.
//   - "Not found" for a known-null field (honest blank, not omission).

import { cn } from "@/lib/utils";

export interface ProvenanceMeta {
  source: string;
  confidence: number;
  retrievedAt: Date;
  verifiedAt: Date | null;
  stale: boolean;
}

// Human-readable time relative to now (e.g. "3 days ago", "just now").
function relativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Confidence bucket: collapse 0-100 to a readable word.
function confidenceLabel(score: number): string {
  if (score >= 90) return "high confidence";
  if (score >= 70) return "medium confidence";
  if (score >= 50) return "low confidence";
  return "inferred";
}

// Normalise provider slugs to display names.
function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    explorium: "Explorium",
    pipe0: "Pipe0",
    exa: "Exa",
    manual: "manual entry",
    inferred: "inferred",
    unknown: "unknown source",
  };
  return map[source.toLowerCase()] ?? source;
}

// The pill itself. Renders as a quiet sub-line of text, not a badge.
// Pass className to control spacing in the parent.
export function ProvenancePill({
  meta,
  className,
}: {
  meta: ProvenanceMeta;
  className?: string;
}) {
  const age = relativeTime(meta.retrievedAt);
  const conf = confidenceLabel(meta.confidence);
  const src = sourceLabel(meta.source);

  return (
    <span
      className={cn(
        "block text-[11px] text-muted-foreground/70 leading-tight select-none",
        meta.stale && "text-warning/70",
        className,
      )}
    >
      via {src}, {age}
      {meta.stale ? " - may be stale" : conf !== "high confidence" ? `, ${conf}` : ""}
    </span>
  );
}

// A field row with an optional provenance line beneath the value.
// Renders "Not found" (honest blank) when value is null/empty and
// a provenance row exists (meaning we did try but failed to find it).
// Renders nothing when value is null and there is no provenance row
// (field was never attempted).
export function FieldWithProvenance({
  label,
  value,
  href,
  meta,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  meta?: ProvenanceMeta;
}) {
  // No value, no provenance attempt - don't render at all.
  if (!value && !meta) return null;

  return (
    <div className="text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value ? (
        href ? (
          <a
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="break-words text-primary underline-offset-4 hover:underline"
          >
            {value}
          </a>
        ) : (
          <p className="break-words">{value}</p>
        )
      ) : (
        <p className="text-muted-foreground/60 italic">Not found</p>
      )}
      {meta && <ProvenancePill meta={meta} className="mt-0.5" />}
    </div>
  );
}
