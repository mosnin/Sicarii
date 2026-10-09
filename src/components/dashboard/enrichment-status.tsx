import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EnrichTier = "new" | "enriched" | "full";

const STEPS: { id: EnrichTier; label: string }[] = [
  { id: "new", label: "New" },
  { id: "enriched", label: "Enriched" },
  { id: "full", label: "Fully enriched" },
];

const RANK: Record<EnrichTier, number> = { new: 0, enriched: 1, full: 2 };

// Derive the enrichment tier for an entity.
export function entityTier(status: string, enrichment: unknown): EnrichTier {
  const e = enrichment && typeof enrichment === "object" && !Array.isArray(enrichment)
    ? (enrichment as Record<string, unknown>) : null;
  if (e && (e.deepReport || e.website_analysis)) return "full";
  if (status === "ENRICHED" || (e && Object.keys(e).length > 0)) return "enriched";
  return "new";
}

// Derive the enrichment tier for a contact (full = linkedin + email + phone).
export function contactTier(c: { status: string; linkedin: string | null; email: string | null; phone: string | null; enrichment: unknown }): EnrichTier {
  if (c.linkedin && c.email && c.phone) return "full";
  const hasEnr = c.enrichment && typeof c.enrichment === "object" && Object.keys(c.enrichment as object).length > 0;
  if (c.status === "ENRICHED" || hasEnr || c.linkedin || c.email || c.phone) return "enriched";
  return "new";
}

export function EnrichmentStatusCard({ tier, action }: { tier: EnrichTier; action?: ReactNode }) {
  const current = RANK[tier];
  const blurb =
    tier === "full" ? "Deep research complete, this record is fully built out."
    : tier === "enriched" ? "Core data is in. Run a deep report to fully enrich."
    : "Not enriched yet. Enrich to pull real data.";

  return (
    <section className="rounded-[8px] border border-border bg-background">
      <header className="flex h-10 items-center border-b border-border px-3">
        <h2 className="text-sm font-medium text-foreground">Enrichment</h2>
      </header>
      <div className="p-3">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = RANK[s.id] <= current;
          return (
            <div key={s.id} className="flex flex-1 items-center gap-2">
              <div className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "h-1 w-full rounded-full transition-colors",
                    done ? "bg-primary" : "bg-muted"
                  )}
                />
                <span className={cn("text-xs", done ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && <span className="sr-only">-</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{blurb}</p>
      {action && <div className="mt-3">{action}</div>}
      </div>
    </section>
  );
}
