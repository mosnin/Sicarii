"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { CommandBox } from "@/components/dashboard/command-box";
import { PulseMoment } from "@/components/dashboard/pulse-moment";
import { NeedsYou, type NeedsData } from "@/components/dashboard/needs-you";
import { BreakupQueue, type PendingDraftItem } from "@/components/dashboard/breakup-queue";
import { cn } from "@/lib/utils";
import type { PulseData } from "@/lib/pulse";

// ─── Motion helpers ──────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: "easeOut" as const,
    },
  },
};

function BentoCard({
  children,
  className,
  href,
  hoverLift = true,
}: {
  children: React.ReactNode;
  className?: string;
  href?: string;
  hoverLift?: boolean;
}) {
  const inner = (
    <motion.div
      variants={cardVariants}
      className={cn(
        "relative overflow-hidden rounded-[8px] border border-border bg-background",
        hoverLift && "transition-colors duration-100 hover:border-border-strong",
        className,
      )}
    >
      {children}
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="group block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent = false,
  delay = 0,
}: {
  label: string;
  value: number;
  accent?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      variants={cardVariants}
      className="flex h-full flex-col justify-between rounded-[8px] border border-border bg-background px-3 py-2.5"
    >
      <p className="twenty-label">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        <CountUp value={value} duration={0.8 + delay * 0.1} />
      </p>
    </motion.div>
  );
}

// ─── Capability card (shown in the empty state instead of a "0") ──────────────

function CapabilityCard({
  n,
  title,
  body,
  href,
}: {
  n: string;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <motion.div variants={cardVariants} className="h-full">
      <Link href={href} className="group block h-full">
        <div className="flex h-full flex-col justify-between gap-3 rounded-[8px] border border-border bg-background px-3 py-2.5 transition-colors duration-100 hover:bg-surface">
          <div className="flex items-start justify-between">
            <span className="twenty-label font-mono tabular-nums">{n}</span>
            <ArrowUpRight
              className="h-4 w-4 text-fg-tertiary opacity-0 transition-opacity duration-100 group-hover:opacity-100"
              strokeWidth={1.6}
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            <p className="mt-0.5 text-sm text-fg-tertiary">{body}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardOverviewProps {
  firstName?: string | null;
  totalContacts: number;
  totalCompanies: number;
  enriched: number;
  inConversation: number;
  radarActive?: number;
  radarSignals?: number;
  pulse?: PulseData | null;
  /** No records yet: render a designed "begin" state, never a wall of zeros. */
  isEmpty?: boolean;
  /** The everyday worklist counts ("what needs me now"). */
  needs?: NeedsData;
  /** Pending breakup drafts awaiting human review, oldest first. Empty/omitted
   *  renders nothing - the card only appears when there's a real decision to make. */
  breakupDrafts?: PendingDraftItem[];
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function DashboardOverview({
  firstName,
  totalContacts,
  totalCompanies,
  enriched,
  inConversation,
  radarActive = 0,
  radarSignals = 0,
  pulse = null,
  isEmpty = false,
  needs = { replied: 0, dueFollowup: 0, toEnrich: 0, radarSignals: 0 },
  breakupDrafts = [],
}: DashboardOverviewProps) {
  const reduce = useReducedMotion();

  const greeting = isEmpty
    ? firstName
      ? `Welcome, ${firstName}.`
      : "Welcome."
    : firstName
      ? `Good to see you, ${firstName}.`
      : "Good to see you.";

  return (
    <motion.div
      variants={containerVariants}
      initial={reduce ? "show" : "hidden"}
      animate="show"
      className="space-y-3"
    >
      {/* ── The Pulse: what the agent did while you were away. First thing a
          returning user sees; only rendered when there's a real delta. ── */}
      {pulse && (
        <motion.div variants={cardVariants}>
          <PulseMoment pulse={pulse} />
        </motion.div>
      )}

      {/* ── HERO card (tall, full width) ─────────────────────────────────── */}
      <BentoCard hoverLift={false} className="min-h-[280px] lg:min-h-[300px]">
        {/* ASCII field - reduced opacity on light mode to preserve text contrast */}
        <AsciiField
          className="absolute inset-0 h-full w-full opacity-[0.18] dark:opacity-[0.30]"
          cell={13}
        />

        {/* Blue radial accent - bottom-right */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 90% 110%, rgba(90,176,232,0.18) 0%, transparent 65%)",
          }}
        />

        {/* Top-left soft blue smear */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(90,176,232,0.35) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        {/* Bottom hairline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(90,176,232,0.5) 50%, transparent)",
          }}
        />

        {/* Subtle scrim behind the greeting text - boosts contrast on light mode */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 dark:hidden"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 20% 60%, rgba(255,255,255,0.55) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-4 sm:p-6">
          {/* Eyebrow */}
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            SCALAR // RESEARCH
          </p>

          {/* Main content */}
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <motion.div
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
              }}
            >
              <motion.h1
                variants={cardVariants}
                className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl"
              >
                {greeting}
              </motion.h1>
              <motion.p
                variants={cardVariants}
                className="mt-1 max-w-md text-sm text-fg-secondary"
              >
                {isEmpty
                  ? "Nothing here yet, and that's the point. Tell Scalar who you sell to and watch your CRM build itself."
                  : "Your research platform - contacts discovered, enriched, and in conversation."}
              </motion.p>

              {/* The one command box - the front door. Type what you want and
                  Scalar routes + runs it. Global search (find what you already
                  have) sits below it as the quieter, secondary affordance. */}
              <motion.div variants={cardVariants} className="mt-4 max-w-xl">
                <CommandBox />
              </motion.div>
              <motion.div variants={cardVariants} className="mt-2 max-w-md">
                <GlobalSearch />
              </motion.div>

              {/* Animated hero stat */}
              <motion.div
                variants={cardVariants}
                className="mt-5 flex items-baseline gap-2"
              >
                {isEmpty ? (
                  <span className="text-base font-medium leading-snug text-foreground">
                    One sentence in the box above,
                    <br className="hidden sm:block" /> and it starts filling.
                  </span>
                ) : (
                  <>
                    <span className="text-3xl font-semibold tabular-nums text-foreground">
                      <CountUp value={totalContacts} duration={1} />
                    </span>
                    <span className="text-sm text-fg-tertiary">contacts</span>
                  </>
                )}
              </motion.div>
            </motion.div>

            {/* CTA */}
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
              {isEmpty ? (
                <>
                  <Button asChild>
                    <Link href="/welcome">Build my CRM</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/integrations">Connect your agent</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild>
                    <Link href="/discover">Discover contacts</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/agent">Ask Scalar</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </BentoCard>

      {/* ── Middle row: live stats (populated) or capability invites (empty).
          Never a wall of zeros. The agent accent card stays in both states. ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isEmpty ? (
          <>
            <CapabilityCard n="01" title="Discover" body="Name an ideal customer and Scalar finds real companies, deduped into your CRM." href="/discover" />
            <CapabilityCard n="02" title="Enrich" body="Every record fills itself: emails, funding, tech stack, news, sourced and dated." href="/crm" />
            <CapabilityCard n="03" title="Track" body="Build a segment from a prompt, then work the deals as a live pipeline." href="/field" />
          </>
        ) : (
          <>
            <StatCard label="Companies" value={totalCompanies} delay={0} />
            <StatCard label="Enriched" value={enriched} accent delay={1} />
            <StatCard label="In conversation" value={inConversation} delay={2} />
          </>
        )}

        {/* Agent accent card - spans 1 col on lg (rightmost in this row) */}
        <motion.div variants={cardVariants} className="h-full">
          <Link href="/agent" className="group block h-full">
            <div className="relative flex h-full min-h-[96px] flex-col justify-between overflow-hidden rounded-[8px] border border-primary bg-primary px-3 py-2.5 transition-colors duration-100 hover:bg-[color-mix(in_oklab,var(--primary)_90%,black)]">
              <div className="flex justify-end">
                <ArrowUpRight className="h-4 w-4 text-white/70 transition-colors duration-100 group-hover:text-white" strokeWidth={1.6} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Ask Scalar</p>
                <p className="mt-0.5 text-sm text-white/80">
                  Your agent, ready to enrich and discover.
                </p>
              </div>
            </div>
          </Link>
        </motion.div>
      </div>

      {/* ── Bottom row: the daily driver + activity ───────────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* A returning user gets "Needs you" (the everyday worklist); a brand-new
            account gets "Explore Scalar" (orientation) instead. Both span 2 cols. */}
        {isEmpty ? (
        <motion.div variants={cardVariants} className="lg:col-span-2">
          <div className="h-full overflow-hidden rounded-[8px] border border-border bg-background">
            <header className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
              <h2 className="text-sm font-medium text-foreground">Explore Scalar</h2>
            </header>
            <div className="p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Discover · Enrich · Converse · Context
                </p>
                <p className="mt-0.5 max-w-sm text-sm text-fg-tertiary">
                  Everything your research workflow needs, in one place.
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  // Focused on the one flow: discover -> enrich into your CRM ->
                  // your agent works it, grounded in your product context. The
                  // secondary surfaces (Radar, Field, Skills) are intentionally
                  // not surfaced here yet; their routes still exist and are
                  // reachable directly until the core moment is proven and felt.
                  { label: "Discover", href: "/discover", body: "Find + enrich the right people" },
                  { label: "CRM", href: "/crm", body: "Records you can trust" },
                  { label: "Scalar", href: "/agent", body: "Your agent runs the pipeline" },
                  { label: "Context", href: "/product-context", body: "Ground your agent in your product" },
                ].map((item) => {
                  return (
                    <div key={item.href}>
                      <Link
                        href={item.href}
                        className="group flex h-full flex-col justify-between gap-1 rounded-[8px] border border-border px-3 py-2 transition-colors duration-100 hover:bg-surface"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <ArrowRight
                            className="h-4 w-4 text-fg-tertiary opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                            strokeWidth={1.6}
                          />
                        </div>
                        <p className="text-xs text-fg-tertiary">{item.body}</p>
                      </Link>
                    </div>
                  );
                })}
              </div>

              {/* Radar lives here as a pulse, not a button: a secondary surface
                  shown on the dashboard (never the dock) as living state. */}
              <Link
                href="/radar"
                className="group -mx-3 -mb-3 mt-3 flex min-h-10 items-center justify-between gap-3 border-t border-border px-3 py-2 transition-colors duration-100 hover:bg-surface"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-tertiary">
                  <span className="font-medium text-foreground">Radar</span>
                  {radarActive > 0 || radarSignals > 0 ? (
                    <span>
                      {radarActive} {radarActive === 1 ? "scan" : "scans"} active
                      {radarSignals > 0
                        ? ` · ${radarSignals} new ${radarSignals === 1 ? "signal" : "signals"} this week`
                        : ""}
                    </span>
                  ) : (
                    <span>Set up a scan to watch for new prospects while you sleep</span>
                  )}
                </span>
                <ArrowRight
                  className="h-4 w-4 text-fg-tertiary opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                  strokeWidth={1.6}
                />
              </Link>
            </div>
          </div>
        </motion.div>
        ) : (
          <motion.div variants={cardVariants} className="lg:col-span-2">
            <NeedsYou needs={needs} />
          </motion.div>
        )}

        {/* Activity / empty state card - spans 1 col */}
        <motion.div variants={cardVariants}>
          <div className="h-full overflow-hidden rounded-[8px] border border-border bg-background">
            <header className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
              <h3 className="text-sm font-medium text-foreground">Recent moves</h3>
              <span className="twenty-label">Activity</span>
            </header>

            {totalContacts === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-start px-3 py-5">
                <p className="text-sm font-medium text-foreground">Nothing yet</p>
                <p className="mt-0.5 text-sm text-fg-tertiary">
                  Start discovering contacts and activity will appear here.
                </p>
                <Link
                  href="/discover"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Discover now
                  <ArrowRight className="h-4 w-4" strokeWidth={1.6} />
                </Link>
              </div>
            ) : (
              /* Has data - show a mini pipeline summary */
              <div className="px-3 py-3">
                {[
                  { label: "Total contacts", value: totalContacts, color: "bg-primary" },
                  {
                    label: "Enriched",
                    value: enriched,
                    color: "bg-primary/60",
                    pct: totalContacts > 0 ? (enriched / totalContacts) * 100 : 0,
                  },
                  {
                    label: "In conversation",
                    value: inConversation,
                    color: "bg-primary/35",
                    pct:
                      totalContacts > 0 ? (inConversation / totalContacts) * 100 : 0,
                  },
                ].map((row) => (
                  <div key={row.label} className="mb-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm text-fg-secondary">{row.label}</span>
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {row.value.toLocaleString()}
                      </span>
                    </div>
                    {"pct" in row && (
                      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
                        <motion.div
                          className={cn("h-full rounded-full", row.color)}
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${row.pct}%` }}
                          transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
                        />
                      </div>
                    )}
                    {"pct" in row === false && (
                      <div className="h-1 w-full rounded-full bg-primary/20" />
                    )}
                  </div>
                ))}

                <Link
                  href="/crm"
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Open CRM
                  <ArrowRight className="h-4 w-4" strokeWidth={1.6} />
                </Link>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Breakup drafts: stalled deals Scalar drafted a close-out for.
          Renders nothing when the queue is empty - never a dead card. ── */}
      {breakupDrafts.length > 0 && (
        <motion.div variants={cardVariants}>
          <BreakupQueue initialDrafts={breakupDrafts} />
        </motion.div>
      )}
    </motion.div>
  );
}
