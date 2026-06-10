"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * How it works, as a connected vertical stepper: a progress line fills as you
 * scroll through the four steps, each revealing a small live visual of the work
 * at that stage. It reads as a single guided path, not four loose cards.
 */

function ConnectVisual() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <span className="font-mono text-xs text-foreground/80">yourcompany.com</span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        connected
      </span>
    </div>
  );
}

function DiscoverVisual() {
  return (
    <div className="space-y-1.5">
      <div className="rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground/80 dark:border-white/10 dark:bg-white/[0.03]">
        <span className="text-muted-foreground">find </span>fintech in NYC
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["Northwind Pay", "Ledgerline", "Cedar Capital"].map((c) => (
          <span key={c} className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground/75 dark:border-white/10">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function EnrichVisual() {
  const fields = [
    { k: "Email", v: "ava@northwindpay.com" },
    { k: "Funding", v: "Series B, $40M" },
  ];
  return (
    <div className="space-y-1">
      {fields.map((f) => (
        <div key={f.k} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.03]">
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{f.k}</span>
          <span className="flex-1 truncate text-sm text-foreground">{f.v}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">verified</span>
        </div>
      ))}
    </div>
  );
}

function OperateVisual() {
  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="flex items-center gap-2 text-xs text-foreground/80">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="font-brand text-foreground">Scalar</span> enriched 12 companies
        <span className="text-muted-foreground">. just now</span>
      </p>
      <p className="mt-1.5 pl-3.5 text-[11px] text-muted-foreground">
        Logged to the audit trail, reversible, replayed on every reply
      </p>
    </div>
  );
}

const steps = [
  {
    title: "Connect",
    description:
      "Sign up, connect your domain and AgentMail key, and point Scalar at your product context. The agents have everything they need in minutes.",
    visual: <ConnectVisual />,
  },
  {
    title: "Discover",
    description:
      "Tell the agent what you want, a company, a role, a list of sites. It finds the matches, pulls verified contacts, and saves them straight into your CRM.",
    visual: <DiscoverVisual />,
  },
  {
    title: "Enrich",
    description:
      "Every record stays alive. Agents fill the gaps, title, company, funding, socials, so your database compounds instead of rotting.",
    visual: <EnrichVisual />,
  },
  {
    title: "Operate",
    description:
      "Email relationships run through AgentMail, context replays on every reply, and every agent action lands in the audit log. Trust by design.",
    visual: <OperateVisual />,
  },
];

export function HowItWorksSection() {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start 0.65", "end 0.5"],
  });
  const fillScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="how-it-works" className="relative scroll-mt-24 bg-muted/40 py-24 dark:bg-charcoal-dark sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">How it works</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            From a name to a <span className="text-gradient-orange">record you trust</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A calm, transparent process that keeps you in control the whole way through.
          </p>
        </div>

        <div ref={trackRef} className="relative mx-auto mt-16 max-w-3xl">
          {/* Connecting line: muted track + primary fill that follows scroll */}
          <div className="absolute bottom-10 left-5 top-5 w-px bg-border" aria-hidden />
          <motion.div
            className="absolute bottom-10 left-5 top-5 w-px origin-top bg-primary"
            style={reduce ? { scaleY: 1 } : { scaleY: fillScale }}
            aria-hidden
          />

          <div className="space-y-10">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={reduce ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, ease: EASE }}
                className="relative grid grid-cols-[2.5rem_1fr] gap-5"
              >
                {/* node */}
                <div className="relative z-10 flex justify-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-background font-brand text-sm tabular-nums text-primary shadow-sm dark:bg-charcoal-dark">
                    0{i + 1}
                  </span>
                </div>

                {/* content */}
                <div className="pb-2">
                  <h3 className="font-brand text-xl text-foreground sm:text-2xl">{step.title}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                  <div className="mt-4 max-w-md rounded-2xl border border-border bg-card p-3 shadow-sm dark:border-white/10">
                    {step.visual}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
