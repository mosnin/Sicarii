"use client";

/**
 * NeedsYou - the everyday "quiet leverage" surface. Where the first run and the
 * Pulse are onboarding/return moments, this is the DAILY driver: the instant a
 * returning user lands, it answers "what should I do now?" with a short,
 * ranked, one-tap worklist (replies waiting first, then follow-ups due, then
 * companies to enrich, then fresh radar signals). When there's nothing, it says
 * so calmly - "you're all caught up, your agent is still watching" - which is
 * itself the North Star feeling, not a dead end.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

export type NeedsData = {
  replied: number;
  dueFollowup: number;
  toEnrich: number;
  radarSignals: number;
};

export type WorklistItem = { count: number; title: string; body: string; href: string; urgent?: boolean };

const EASE = [0.16, 1, 0.3, 1] as const;

// Pure worklist builder: the ranked, non-empty items and their total. Ranked
// most-urgent first (a reply waiting beats a cold company). Exported for tests.
export function worklistItems(needs: NeedsData): { items: WorklistItem[]; total: number } {
  const items = [
    { count: needs.replied, title: "replied", body: "Someone is waiting on you", href: "/crm", urgent: true },
    { count: needs.dueFollowup, title: "to follow up", body: "No touch in 3+ days", href: "/crm" },
    { count: needs.toEnrich, title: "to enrich", body: "Companies missing a full profile", href: "/crm?tab=entities" },
    { count: needs.radarSignals, title: "new signals", body: "Fresh from your radar this week", href: "/radar" },
  ].filter((i) => i.count > 0);
  return { items, total: items.reduce((s, i) => s + i.count, 0) };
}

export function NeedsYou({ needs }: { needs: NeedsData }) {
  const reduce = useReducedMotion();
  const { items, total } = worklistItems(needs);

  return (
    <div className="relative h-full overflow-hidden rounded-3xl bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.07),0_1px_4px_-1px_rgba(0,0,0,0.05)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 80% at 0% 0%, rgba(90,176,232,0.08) 0%, transparent 65%)" }}
      />
      <div className="relative z-10 p-6 sm:p-8">
        <div className="flex items-baseline justify-between">
          <p className="font-brand text-xs uppercase tracking-[0.3em] text-primary">Needs you</p>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">{total} {total === 1 ? "thing" : "things"}</span>
          )}
        </div>

        {items.length === 0 ? (
          <div className="mt-6 flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <div>
              <h3 className="font-brand text-xl text-foreground">You&apos;re all caught up.</h3>
              <p className="mt-1 text-sm text-muted-foreground">Your agent is still watching. Check back after your next radar run.</p>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-2.5">
            {items.map((item, i) => (
              <motion.div
                key={item.title}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.05 * i }}
              >
                <Link
                  href={item.href}
                  className="group flex items-center gap-4 rounded-2xl border border-transparent bg-background/50 p-3.5 transition-colors hover:border-primary/30 hover:bg-accent/40"
                >
                  <span
                    className={
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-brand text-lg tabular-nums " +
                      (item.urgent ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")
                    }
                  >
                    {item.count}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {item.count} {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{item.body}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
