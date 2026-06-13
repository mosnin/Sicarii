"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

/**
 * An interactive usage estimator for the pricing page. Drag the sliders for the
 * work your agents do in a month and it sums the credits live (1 credit = $0.01)
 * and recommends the plan that covers it. Honest math: each driver uses the same
 * credit cost the product charges.
 */

type Driver = {
  id: string;
  label: string;
  unit: string;
  cost: number; // credits per unit
  max: number;
  step: number;
  default: number;
};

const drivers: Driver[] = [
  { id: "discovery", label: "Discovery runs", unit: "prompts", cost: 12, max: 200, step: 5, default: 40 },
  { id: "emails", label: "Verified emails", unit: "found", cost: 8, max: 600, step: 10, default: 120 },
  { id: "enrich", label: "Company enrichments", unit: "companies", cost: 30, max: 300, step: 5, default: 60 },
  { id: "research", label: "Deep research runs", unit: "reports", cost: 18, max: 200, step: 5, default: 20 },
];

// Plan monthly credit allotments, smallest first. Business is omitted here: it
// carries fewer credits than Pro (it trades credit volume for more monitors).
const plans = [
  { name: "Free", credits: 200, href: "/sign-up" },
  { name: "Starter", credits: 3000, href: "/sign-up?plan=starter" },
  { name: "Pro", credits: 12000, href: "/sign-up?plan=pro" },
];

export function UsageEstimator() {
  const [vals, setVals] = useState<Record<string, number>>(
    Object.fromEntries(drivers.map((d) => [d.id, d.default])),
  );

  const total = useMemo(
    () => drivers.reduce((sum, d) => sum + vals[d.id] * d.cost, 0),
    [vals],
  );

  const recommended = useMemo(() => {
    const fit = plans.find((p) => p.credits >= total);
    if (fit) return { name: fit.name, href: fit.href, note: "covers this every month" };
    return { name: "Pro plus top-ups", href: "/sign-up?plan=pro", note: "or Business for a team" };
  }, [total]);

  const dollars = (total * 0.01).toFixed(0);

  return (
    <div className="mx-auto grid max-w-4xl gap-4 rounded-[1.75rem] border border-border bg-card p-6 shadow-xl shadow-black/[0.04] sm:p-8 lg:grid-cols-[1fr_minmax(0,260px)] dark:border-white/10 dark:shadow-black/40">
      {/* Sliders */}
      <div className="space-y-6">
        {drivers.map((d) => (
          <div key={d.id}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`est-${d.id}`} className="text-sm font-medium text-foreground">
                {d.label}
              </label>
              <span className="font-brand text-sm tabular-nums text-foreground">
                {vals[d.id].toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">{d.unit} / mo</span>
              </span>
            </div>
            <input
              id={`est-${d.id}`}
              type="range"
              min={0}
              max={d.max}
              step={d.step}
              value={vals[d.id]}
              onChange={(e) => setVals((v) => ({ ...v, [d.id]: Number(e.target.value) }))}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              aria-label={d.label}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{d.cost} credits each</p>
          </div>
        ))}
      </div>

      {/* Live total + recommendation */}
      <div className="flex flex-col justify-center rounded-2xl border border-border bg-muted/40 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <p className="text-xs uppercase tracking-[0.25em] text-primary">Estimated</p>
        <motion.p
          key={total}
          initial={{ opacity: 0.5, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-2 font-brand text-4xl tabular-nums text-foreground"
        >
          {total.toLocaleString()}
        </motion.p>
        <p className="text-sm text-muted-foreground">credits / month</p>
        <p className="mt-1 text-xs text-muted-foreground">about ${dollars} in usage</p>

        <div className="mt-5 border-t border-border pt-5 dark:border-white/10">
          <p className="text-sm text-foreground">
            <span className="font-brand text-primary">{recommended.name}</span> {recommended.note}
          </p>
          <Link
            href={recommended.href}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
