"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { cn } from "@/lib/utils";

// ─── Motion helpers ──────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
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
      whileHover={hoverLift ? { y: -4, transition: { duration: 0.25, ease: "easeOut" } } : undefined}
      className={cn(
        "relative overflow-hidden rounded-3xl bg-card",
        "shadow-[0_2px_12px_-2px_rgba(0,0,0,0.07),0_1px_4px_-1px_rgba(0,0,0,0.05)]",
        hoverLift && "transition-shadow duration-300 hover:shadow-[0_8px_32px_-4px_rgba(90,176,232,0.22),0_2px_8px_-2px_rgba(0,0,0,0.08)]",
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
  const reduce = useReducedMotion();
  return (
    <SpotlightCard
      className={cn(
        "h-full border-0 bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.07),0_1px_4px_-1px_rgba(0,0,0,0.05)]",
        accent && "bg-accent/40",
      )}
    >
      <motion.div
        variants={cardVariants}
        whileHover={{ y: -3, transition: { duration: 0.22, ease: "easeOut" } }}
        className="flex h-full flex-col justify-between p-6"
      >
        {/* Animated shimmer on accent card */}
        {accent && !reduce && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-3xl"
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(90,176,232,0.18) 0%, transparent 70%)",
            }}
          />
        )}
        <div>
          <p
            className={cn(
              "font-brand text-4xl tabular-nums",
              accent ? "text-primary" : "text-foreground",
            )}
          >
            <CountUp value={value} duration={1.2 + delay * 0.15} />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </div>
      </motion.div>
    </SpotlightCard>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardOverviewProps {
  firstName?: string | null;
  totalContacts: number;
  totalCompanies: number;
  enriched: number;
  inConversation: number;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function DashboardOverview({
  firstName,
  totalContacts,
  totalCompanies,
  enriched,
  inConversation,
}: DashboardOverviewProps) {
  const reduce = useReducedMotion();

  const greeting = firstName ? `Good to see you, ${firstName}.` : "Good to see you.";

  return (
    <motion.div
      variants={containerVariants}
      initial={reduce ? "show" : "hidden"}
      animate="show"
      className="space-y-4"
    >
      {/* ── HERO card (tall, full width) ─────────────────────────────────── */}
      <BentoCard hoverLift={false} className="min-h-[340px] lg:min-h-[380px]">
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

        <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-8 lg:p-10">
          {/* Eyebrow */}
          <p className="font-brand text-xs uppercase tracking-[0.3em] text-primary">
            SCALAR // RESEARCH
          </p>

          {/* Main content */}
          <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <motion.div
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
              }}
            >
              <motion.h1
                variants={cardVariants}
                className="font-brand text-3xl leading-tight text-foreground sm:text-4xl lg:text-5xl"
              >
                {greeting}
              </motion.h1>
              <motion.p
                variants={cardVariants}
                className="mt-3 max-w-md text-base text-muted-foreground"
              >
                Your research platform - contacts discovered, enriched, and in conversation.
              </motion.p>

              {/* Global search */}
              <motion.div variants={cardVariants} className="mt-5 max-w-md">
                <GlobalSearch />
              </motion.div>

              {/* Animated hero stat */}
              <motion.div
                variants={cardVariants}
                className="mt-8 flex items-baseline gap-3"
              >
                <span className="font-brand text-7xl tabular-nums text-foreground sm:text-8xl">
                  <CountUp value={totalContacts} duration={1.6} />
                </span>
                <span className="text-lg text-muted-foreground">contacts</span>
              </motion.div>
            </motion.div>

            {/* CTA */}
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
              <Button variant="glow" size="lg" asChild>
                <Link href="/discover">
                  Discover contacts
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/agent">
                  Ask Scalar
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </BentoCard>

      {/* ── Middle row: stat cards + agent accent ────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Companies */}
        <StatCard
          label="Companies"
          value={totalCompanies}
          delay={0}
        />

        {/* Enriched */}
        <StatCard
          label="Enriched"
          value={enriched}
          accent
          delay={1}
        />

        {/* In conversation */}
        <StatCard
          label="In conversation"
          value={inConversation}
          delay={2}
        />

        {/* Agent accent card - spans 1 col on lg (rightmost in this row) */}
        <motion.div variants={cardVariants} className="h-full">
          <Link href="/agent" className="group block h-full">
            <motion.div
              whileHover={{ y: -4, transition: { duration: 0.25, ease: "easeOut" } }}
              className="relative h-full min-h-[180px] overflow-hidden rounded-3xl transition-shadow duration-300 hover:shadow-[0_8px_40px_-4px_rgba(90,176,232,0.35)]"
              style={{
                background:
                  "linear-gradient(135deg, #5AB0E8 0%, #8FCCF2 55%, #BFE2F8 100%)",
              }}
            >
              {/* Noise overlay for depth */}
              <div
                className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
              />
              {/* Glass reflection */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 50%)",
                }}
              />
              {/* Animated shimmer sweep */}
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
                }}
                animate={{ x: ["-110%", "110%"] }}
                transition={{
                  duration: 2.8,
                  repeat: Infinity,
                  repeatDelay: 4,
                  ease: "easeInOut",
                }}
              />

              <div className="relative z-10 flex h-full flex-col justify-between p-6">
                <div className="flex justify-end">
                  <ArrowUpRight className="h-5 w-5 text-white/70 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
                </div>
                <div>
                  <p className="font-brand text-xl text-white">Ask Scalar</p>
                  <p className="mt-1 text-sm text-white/75">
                    Your agent, ready to enrich and discover.
                  </p>
                </div>
              </div>
            </motion.div>
          </Link>
        </motion.div>
      </div>

      {/* ── Bottom row: explore + activity ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Quick-explore card - spans 2 cols */}
        <motion.div variants={cardVariants} className="lg:col-span-2">
          <motion.div
            whileHover={{ y: -3, transition: { duration: 0.25, ease: "easeOut" } }}
            className="relative overflow-hidden rounded-3xl border border-dashed border-primary/40 bg-accent/30 transition-shadow duration-300 hover:shadow-[0_8px_32px_-4px_rgba(90,176,232,0.15)]"
          >
            {/* Subtle radial */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 60% 80% at 0% 100%, rgba(90,176,232,0.10) 0%, transparent 65%)",
              }}
            />

            <div className="relative z-10 p-8">
              <div>
                <p className="font-brand text-xs uppercase tracking-[0.3em] text-primary">
                  Explore Scalar
                </p>
                <h2 className="font-brand mt-2 text-2xl text-foreground sm:text-3xl">
                  Discover · Enrich · Converse · Context
                </h2>
                <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                  Everything your research workflow needs, in one place.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Discover", href: "/discover", body: "Find contacts" },
                  { label: "Radar", href: "/radar", body: "Scheduled scans" },
                  { label: "CRM", href: "/crm", body: "Your database" },
                  { label: "Field", href: "/field", body: "Segments + deals" },
                  { label: "Scalar", href: "/agent", body: "AI assistant" },
                  { label: "Context", href: "/product-context", body: "Your product" },
                  { label: "Skills", href: "/skills", body: "Agent playbooks" },
                ].map((item) => {
                  return (
                    <motion.div
                      key={item.href}
                      whileHover={reduce ? {} : { y: -3, transition: { duration: 0.2, ease: "easeOut" } }}
                      whileTap={reduce ? {} : { scale: 0.97 }}
                    >
                      <Link
                        href={item.href}
                        className="group flex flex-col justify-between gap-3 rounded-2xl bg-card p-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.07)] transition-shadow duration-200 hover:shadow-[0_6px_20px_-4px_rgba(90,176,232,0.16)]"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-brand text-sm font-semibold text-foreground">{item.label}</p>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </div>
                        <p className="text-xs text-muted-foreground">{item.body}</p>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Activity / empty state card - spans 1 col */}
        <motion.div variants={cardVariants}>
          <motion.div
            whileHover={{ y: -3, transition: { duration: 0.25, ease: "easeOut" } }}
            className="relative overflow-hidden rounded-3xl bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.07),0_1px_4px_-1px_rgba(0,0,0,0.05)] transition-shadow duration-300 hover:shadow-[0_8px_32px_-4px_rgba(90,176,232,0.18),0_2px_8px_-2px_rgba(0,0,0,0.08)]"
          >
            <div className="p-6">
              <p className="font-brand text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Activity
              </p>
              <h3 className="font-brand mt-2 text-xl text-foreground">Recent moves</h3>
            </div>

            {totalContacts === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center px-6 pb-10 pt-2 text-center">
                {/* Animated idle ring */}
                <motion.div
                  className="relative mb-6 flex h-20 w-20 items-center justify-center"
                  animate={{
                    scale: [1, 1.04, 1],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <div className="absolute inset-0 rounded-full border border-primary/25" />
                  <div
                    className="absolute inset-2 rounded-full border border-primary/15"
                    style={{ animationDelay: "0.5s" }}
                  />
                </motion.div>

                <p className="text-sm font-medium text-foreground">Nothing yet</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Start discovering contacts and activity will appear here.
                </p>
                <Link
                  href="/discover"
                  className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Discover now
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              /* Has data - show a mini pipeline summary */
              <div className="px-6 pb-8">
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
                  <div key={row.label} className="mb-5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="font-brand text-sm tabular-nums text-foreground">
                        {row.value.toLocaleString()}
                      </span>
                    </div>
                    {"pct" in row && (
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className={cn("h-full rounded-full", row.color)}
                          initial={{ width: 0 }}
                          animate={{ width: `${row.pct}%` }}
                          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
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
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Open CRM
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
