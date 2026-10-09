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

const EASE = "easeOut" as const;

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
    <section className="h-full rounded-[8px] border border-border bg-background">
      <header className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-sm font-medium text-foreground">Needs you</h2>
        {total > 0 && (
          <span className="text-sm tabular-nums text-fg-tertiary">{total} {total === 1 ? "thing" : "things"}</span>
        )}
      </header>

      {items.length === 0 ? (
        <div className="flex items-start gap-2.5 px-3 py-4">
          <span className="relative mt-1.5 flex h-2 w-2 shrink-0">
            {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <div>
            <h3 className="text-sm font-medium text-foreground">You&apos;re all caught up.</h3>
            <p className="mt-0.5 text-sm text-fg-tertiary">Your agent is still watching. Check back after your next radar run.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, i) => (
            <motion.li
              key={item.title}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: EASE, delay: 0.03 * i }}
            >
              <Link
                href={item.href}
                className="group flex h-10 items-center gap-3 px-3 text-sm transition-colors hover:bg-surface"
              >
                <span
                  className={
                    "inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded-[4px] px-1.5 text-xs font-medium tabular-nums " +
                    (item.urgent ? "bg-tag-blue-bg text-tag-blue" : "bg-surface-2 text-fg-secondary")
                  }
                >
                  {item.count}
                </span>
                <span className="shrink-0 font-medium text-foreground">
                  {item.count} {item.title}
                </span>
                <span className="min-w-0 flex-1 truncate text-fg-tertiary">{item.body}</span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                  strokeWidth={1.6}
                />
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}
