"use client";

import { motion } from "motion/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The depth the word "CRM" hides, as an Apple-style bento: a few feature tiles
 * with live mini-visuals (intent, web traffic, decision-makers, deep research)
 * sized larger than the rest, so breadth reads as depth, not a uniform grid.
 * Each visual animates once on view and respects reduced motion through the
 * shared whileInView pattern.
 */

function Tile({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className={"h-full " + className}
    >
      <SpotlightCard className="flex h-full flex-col p-6">{children}</SpotlightCard>
    </motion.div>
  );
}

function TileHead({ label, body }: { label: string; body: string }) {
  return (
    <>
      <h3 className="font-brand text-lg text-foreground">{label}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </>
  );
}

/* ------------------------------- Visuals ---------------------------------- */

function IntentMini() {
  const bars = [
    { name: "Northwind Pay", score: 94, tone: "bg-success", label: "In-market" },
    { name: "Cedar Capital", score: 78, tone: "bg-primary", label: "Researching" },
    { name: "Atlas Treasury", score: 41, tone: "bg-muted-foreground/40", label: "Quiet" },
  ];
  return (
    <div className="mt-5 space-y-2.5">
      {bars.map((b, i) => (
        <div key={b.name}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/80">{b.name}</span>
            <span className="text-muted-foreground">{b.label}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className={`h-full rounded-full ${b.tone}`}
              initial={{ width: 0 }}
              whileInView={{ width: `${b.score}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease: EASE }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Sparkline() {
  // A gently rising sparkline that draws itself once in view.
  const d = "M0 38 L18 34 L36 36 L54 26 L72 28 L90 18 L108 20 L126 9 L144 11";
  return (
    <div className="mt-5">
      <svg viewBox="0 0 144 46" className="h-16 w-full" fill="none" preserveAspectRatio="none">
        <motion.path
          d={`${d} L144 46 L0 46 Z`}
          fill="url(#sparkfill)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
        />
        <motion.path
          d={d}
          stroke="var(--color-primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: EASE }}
        />
        <defs>
          <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function ContactMini() {
  return (
    <div className="mt-5 rounded-xl border border-border bg-background/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="font-brand text-sm text-foreground">Ava Chen</span>
        <span className="text-xs text-muted-foreground">VP Sales</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-foreground/70 dark:border-white/10">
          ava@northwindpay.com
        </span>
        <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-foreground/70 dark:border-white/10">
          verified
        </span>
      </div>
    </div>
  );
}

function ResearchMini() {
  return (
    <div className="mt-5 rounded-xl border border-border bg-background/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="font-mono text-[11px] text-muted-foreground">
        <span className="text-primary">? </span>Are they hiring SDRs right now?
      </p>
      <p className="mt-2 text-sm text-foreground/85">
        Yes. Three open SDR roles posted in the last 14 days, plus a new VP Sales hire.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {["careers page", "press release", "LinkedIn"].map((s) => (
          <span key={s} className="rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground dark:border-white/10">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export function IntelligenceSection() {
  return (
    <section id="intelligence" className="relative scroll-mt-24 bg-muted/30 py-24 dark:bg-background sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Intelligence and intent</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            Depth most teams never reach.{" "}
            <span className="text-gradient-orange">In seconds.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A CRM stores what you type. Scalar&apos;s agents go get it: a full
            picture of a company and the people who matter, plus who is ready to
            buy, faster than you could open a new tab.
          </p>
        </div>

        <div className="mt-14 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Buying intent: the accent, a wide feature tile */}
          <Tile className="lg:col-span-2" delay={0}>
            <TileHead label="Buying intent" body="Who is actively looking for what you sell, scored and refreshed, so your agent reaches them while the window is open." />
            <IntentMini />
          </Tile>

          {/* Decision-makers with a mini contact card */}
          <Tile delay={0.06}>
            <TileHead label="Decision-makers" body="The right people, with verified email and mobile." />
            <ContactMini />
          </Tile>

          {/* Three compact text tiles */}
          <Tile delay={0}>
            <TileHead label="Firmographics" body="Size, industry, location, and the shape of the business." />
          </Tile>
          <Tile delay={0.06}>
            <TileHead label="Funding" body="Rounds and timing, so you reach out when the budget lands." />
          </Tile>
          <Tile delay={0.12}>
            <TileHead label="Tech stack" body="What they run, so your agent leads with relevance." />
          </Tile>

          {/* Web traffic with a sparkline */}
          <Tile className="lg:col-span-2" delay={0}>
            <TileHead label="Web traffic" body="Growth and momentum, read at a glance instead of guessed." />
            <Sparkline />
          </Tile>

          {/* Recent news, compact */}
          <Tile delay={0.06}>
            <TileHead label="Recent news" body="The triggers worth a first line." />
          </Tile>

          {/* Deep research, full width, with a sourced answer */}
          <Tile className="lg:col-span-3" delay={0}>
            <div className="grid gap-4 lg:grid-cols-2 lg:items-center">
              <div>
                <TileHead label="Deep research" body="Sourced answers to the questions that actually close, not a wall of links. Ask anything about an account and get a cited, verifiable answer." />
              </div>
              <ResearchMini />
            </div>
          </Tile>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground"
        >
          Noisy results are refined into real, deduped companies, never
          aggregators, never the wrong person. Accuracy beats coverage, always.
        </motion.p>
      </div>
    </section>
  );
}
