"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AsciiField } from "@/components/dashboard/ascii-field";

type State = "confirm" | "running" | "done";

// Usage-aware confirmation modal with the signature ASCII aesthetic. Warns that
// bulk enrichment may consume more usage before it runs.
export function BulkEnrichModal({
  open,
  count,
  noun,
  state,
  resultText,
  onConfirm,
  onClose,
}: {
  open: boolean;
  count: number;
  noun: string;
  state: State;
  resultText?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && state !== "running") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close"
            onClick={state === "running" ? undefined : onClose}
            className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
          >
            <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14] dark:opacity-30" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(90,176,232,0.12),transparent_60%)]" />

            <div className="relative z-10 p-6 sm:p-7">
              <div className="flex items-start justify-between">
                <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary/80">
                  Scalar // Bulk enrich
                </p>
                {state !== "running" && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {state === "done" ? (
                <>
                  <h2 className="font-brand mt-3 flex items-center gap-2 text-xl text-foreground">
                    <Check className="h-5 w-5 text-green-500" />
                    Done
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {resultText ?? "Enrichment complete."}
                  </p>
                  <div className="mt-6 flex justify-end">
                    <Button onClick={onClose}>Close</Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="font-brand mt-3 text-xl text-foreground">
                    Enrich {count} {count === 1 ? noun : `${noun}s`}?
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    This runs live data providers for every selected record and
                    <span className="text-foreground"> may consume more usage</span>.
                    Records already filled are skipped.
                  </p>
                  <div className="mt-6 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={state === "running"}>
                      Cancel
                    </Button>
                    <Button variant="glow" onClick={onConfirm} disabled={state === "running"}>
                      {state === "running" ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          Enriching…
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1.5 h-4 w-4" />
                          Enrich {count}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
