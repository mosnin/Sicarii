"use client";

/**
 * PulseMoment - "The Pulse": the felt proof of quiet leverage. When a returning
 * user lands and their agent did real work in the away-window, this is the FIRST
 * thing they see - a calm band that counts up what happened and names the best
 * find, then can be dismissed into the day. It is never an empty brag: the
 * parent only renders it when computePulse returned a non-null delta.
 *
 * Restraint on purpose (the North Star is quiet leverage, not confetti): one
 * soft pulse dot, numbers that count, one named result, a clean dismiss.
 */

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import { cn } from "@/lib/utils";
import type { PulseData } from "@/lib/pulse";

const EASE = [0.16, 1, 0.3, 1] as const;

function Stat({ value, label, delay }: { value: number; label: string; delay: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-brand text-2xl tabular-nums text-foreground sm:text-3xl">
        <CountUp value={value} duration={1.1 + delay * 0.2} />
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function PulseMoment({ pulse }: { pulse: PulseData }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);

  const stats: { value: number; label: string }[] = [];
  if (pulse.companies > 0) stats.push({ value: pulse.companies, label: pulse.companies === 1 ? "company added" : "companies added" });
  if (pulse.enriched > 0) stats.push({ value: pulse.enriched, label: pulse.enriched === 1 ? "record enriched" : "records enriched" });
  if (pulse.inMarket > 0) stats.push({ value: pulse.inMarket, label: "in-market" });
  if (stats.length === 0) return null;

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0, height: 0, y: -8 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -8, transition: { duration: 0.4, ease: EASE } }}
          transition={{ duration: 0.6, ease: EASE }}
          className="overflow-hidden"
        >
          <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 sm:p-5">
            {/* soft blue wash */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse 60% 100% at 100% 0%, rgba(90,176,232,0.10) 0%, transparent 70%)" }}
            />
            <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />}
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                  While you were away
                </span>
              </div>

              <motion.div
                className="flex flex-wrap items-center gap-x-6 gap-y-1"
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } } }}
              >
                {stats.map((s, i) => (
                  <motion.div
                    key={s.label}
                    variants={{ hidden: reduce ? {} : { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }}
                  >
                    <Stat value={s.value} label={s.label} delay={i} />
                  </motion.div>
                ))}
              </motion.div>

              {pulse.best && (
                <motion.div
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.5 }}
                  className="ml-auto flex items-center gap-2 text-sm"
                >
                  <span className="text-muted-foreground">Latest:</span>
                  <Link href="/crm?tab=entities" className="font-medium text-foreground hover:text-primary hover:underline">
                    {pulse.best.name}
                  </Link>
                </motion.div>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Dismiss"
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground",
                  pulse.best ? "" : "ml-auto",
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
