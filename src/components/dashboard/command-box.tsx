"use client";

/**
 * CommandBox - the one thing. Type what you want in plain language ("find
 * fintech founders in NYC", "enrich stripe.com", "who's raising in climate")
 * and Scalar routes it to the right action and runs it. This is the front door:
 * one input instead of a control panel of tools. It posts to
 * /api/discover/route-intent, then hands off to /discover which auto-runs the
 * chosen tool and renders results in the existing pipeline.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "find Series A fintech startups in NYC",
  "enrich stripe.com",
  "dentists in Austin with a phone number",
  "who is actively hiring for RevOps",
  "funding history for figma.com",
  "find the VP of Sales at notion.so",
];

export function CommandBox({ className }: { className?: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotate the example placeholder while the box is empty and idle.
  useEffect(() => {
    if (value || loading) return;
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(t);
  }, [value, loading]);

  async function submit(intent: string) {
    const q = intent.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/discover/route-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.toolId) {
        // Never dead-end: hand the raw phrase to discover as a web search.
        router.push(`/discover?run=web-search&query=${encodeURIComponent(q)}`);
        return;
      }
      const params = new URLSearchParams({ run: data.toolId });
      for (const [k, v] of Object.entries(data.params ?? {})) {
        if (typeof v === "string" && v) params.set(k, v);
      }
      router.push(`/discover?${params.toString()}`);
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className={cn("w-full", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className={cn(
          "group relative flex items-center gap-2 rounded-2xl border bg-card px-3 py-2 transition-all duration-300",
          "border-border shadow-[0_2px_16px_-4px_rgba(90,176,232,0.18)]",
          "focus-within:border-primary/50 focus-within:shadow-[0_6px_28px_-6px_rgba(90,176,232,0.35)]",
        )}
      >
        <span className="pl-1.5 text-primary">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        </span>

        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            aria-label="Tell Scalar what to find"
            className="w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-transparent sm:text-lg"
          />
          {/* Animated placeholder: only when empty + idle */}
          {!value && !loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
              <span className="mr-1.5 text-muted-foreground">Try</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={exampleIdx}
                  initial={reduce ? false : { y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: -14, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="truncate text-muted-foreground"
                >
                  {EXAMPLES[exampleIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!value.trim() || loading}
          aria-label="Run"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
            value.trim() && !loading
              ? "bg-primary text-primary-foreground hover:scale-105"
              : "bg-muted text-muted-foreground",
          )}
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </form>

      <div className="mt-2 flex min-h-[1.25rem] items-center gap-2 pl-1 text-xs text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : loading ? (
          <span>Routing your request...</span>
        ) : (
          <span>Ask in plain language. Scalar picks the right tool and runs it.</span>
        )}
      </div>
    </div>
  );
}
