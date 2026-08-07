"use client";

/**
 * SuggestionsQueue - the review surface for the evidence ledger. When Scalar
 * observes something about a record but the evidence is not strong enough to
 * write itself onto the row (see src/lib/evidence.ts), the claim lands here
 * instead of being thrown away. A person reads what was actually seen and
 * settles it in one tap.
 *
 * Modelled on BreakupQueue - same eyebrow/panel/card shape, same optimistic
 * removal on decision, no restyle. The difference is the body: a suggestion is
 * a diff (current value vs proposed) plus the evidence behind it, since the
 * only reason this card exists is to show a human the reasoning rather than a
 * bare confidence number.
 *
 * Server component fetches the initial queue via listProposedFacts; this client
 * component owns apply/dismiss.
 */

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ProposedFactItem = {
  id: string;
  recordType: "CONTACT" | "ENTITY";
  recordId: string;
  recordName: string | null;
  field: string;
  value: string;
  currentValue: string | null;
  score: number;
  band: string;
  method: string;
  sourceUrl: string | null;
  observedAt: string;
  evidence: { kind: string; label: string; detail: string | null; sourceUrl: string | null }[];
  rationale: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;

function recordLabel(fact: ProposedFactItem): string {
  const who = fact.recordName || (fact.recordType === "CONTACT" ? "Unnamed contact" : "Unnamed company");
  return `${who} · ${fact.field}`;
}

export function SuggestionsQueue({ initialFacts }: { initialFacts: ProposedFactItem[] }) {
  const reduce = useReducedMotion();
  const [facts, setFacts] = useState(initialFacts);

  if (facts.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.07),0_1px_4px_-1px_rgba(0,0,0,0.05)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 80% at 100% 0%, rgba(90,176,232,0.08) 0%, transparent 65%)" }}
      />
      <div className="relative z-10 p-6 sm:p-8">
        <div className="flex items-baseline justify-between">
          <p className="font-brand text-xs uppercase tracking-[0.3em] text-primary">Worth a look</p>
          <span className="text-xs text-muted-foreground">
            {facts.length} {facts.length === 1 ? "suggestion" : "suggestions"}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Scalar found these but the evidence stops short of certain, so nothing was written. Read what it saw, then
          apply or dismiss.
        </p>

        <div className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {facts.map((fact) => (
              <motion.div
                key={fact.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <FactCard
                  fact={fact}
                  onDecided={(id) => setFacts((prev) => prev.filter((f) => f.id !== id))}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function FactCard({
  fact,
  onDecided,
}: {
  fact: ProposedFactItem;
  onDecided: (id: string) => void;
}) {
  const [busy, setBusy] = useState<"apply" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "apply" | "dismiss") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/facts/${fact.id}/${action}`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? `Couldn't ${action} this suggestion.`);
        return;
      }
      onDecided(fact.id);
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{recordLabel(fact)}</p>
          {/* The band and score are the ledger's own words for how sure it is,
              shown plainly rather than dressed up as a percentage of truth. */}
          <p className="text-xs text-muted-foreground">
            {fact.band.toLowerCase()} · {fact.score.toFixed(2)} · via {fact.method}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => decide("dismiss")} disabled={disabled}>
            {busy === "dismiss" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1.5 h-3.5 w-3.5" />}
            Dismiss
          </Button>
          <Button size="sm" variant="glow" onClick={() => decide("apply")} disabled={disabled}>
            {busy === "apply" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
            Apply
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-muted/40 p-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          {fact.currentValue ? (
            <span className="text-muted-foreground line-through">{fact.currentValue}</span>
          ) : (
            <span className="text-muted-foreground">empty</span>
          )}
          <span className="text-muted-foreground">to</span>
          <span className="font-medium text-foreground">{fact.value}</span>
        </div>

        <ul className="mt-2.5 space-y-1.5">
          {fact.evidence.map((e, i) => (
            <li key={`${e.kind}-${i}`} className="text-xs text-muted-foreground">
              <span className="text-foreground/80">{e.label}</span>
              {e.detail ? <span> : {e.detail}</span> : null}
              {e.sourceUrl ? (
                <>
                  {" "}
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-primary"
                  >
                    source
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
