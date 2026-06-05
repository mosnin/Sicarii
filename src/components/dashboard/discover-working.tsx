"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";

const WORDS = [
  "Digging",
  "Pulling",
  "Searching",
  "Enriching",
  "Cross-referencing",
  "Verifying",
  "Mapping",
];

const spring = [0.16, 1, 0.3, 1] as const;

/**
 * DiscoverWorking — the premium "Scalar is thinking" loader shown while
 * /api/discover is in flight. Cycles action words with a blur+rise morph,
 * over a soft ASCII field backdrop. Respects prefers-reduced-motion.
 */
export function DiscoverWorking() {
  const [wordIdx, setWordIdx] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(
      () => setWordIdx((i) => (i + 1) % WORDS.length),
      1100
    );
    return () => clearInterval(id);
  }, [reduce]);

  if (reduce) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border bg-card p-8">
        <p className="text-muted-foreground text-sm">Working…</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-card">
      {/* Soft ASCII backdrop */}
      <AsciiField
        className="absolute inset-0 h-full w-full opacity-30"
        speed={0.025}
        cell={14}
      />

      {/* Radial pulse — baby blue, very subtle */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        animate={{
          background: [
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(90,176,232,0.06) 0%, transparent 70%)",
            "radial-gradient(ellipse 80% 65% at 50% 50%, rgba(90,176,232,0.12) 0%, transparent 70%)",
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(90,176,232,0.06) 0%, transparent 70%)",
          ],
        }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Word morph */}
      <div className="relative flex flex-col items-center gap-3 px-8 text-center">
        <div className="relative h-9 w-56">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={WORDS[wordIdx]}
              initial={{ y: "0.5em", opacity: 0, filter: "blur(8px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-0.4em", opacity: 0, filter: "blur(8px)" }}
              transition={{ duration: 0.55, ease: spring }}
              className="font-brand absolute inset-0 flex items-center justify-center text-xl text-foreground"
            >
              {WORDS[wordIdx]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Dot pulse row */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block h-1.5 w-1.5 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.22,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
