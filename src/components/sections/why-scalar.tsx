"use client";

import { motion } from "motion/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const easeOut = [0.16, 1, 0.3, 1] as const;

// The moat: everyone else owns one of these. Scalar is all four as one system.
const pillars = [
  {
    n: "01",
    title: "Structured storage",
    body: "Typed entities, contacts, deals, emails, and memory in Postgres, not free-text files. Deduped and validated on the way in.",
  },
  {
    n: "02",
    title: "A real UI",
    body: "Humans can see, trust, edit, and navigate exactly what the agent did. No black box, no markdown spelunking.",
  },
  {
    n: "03",
    title: "Built-in intelligence",
    body: "Discovery, enrichment, intent, and deep research are first-class tools - best-in-class providers, orchestrated and refined into real, deduped companies.",
  },
  {
    n: "04",
    title: "Agent-native by default",
    body: "A secure MCP surface and per-user keys mean your agent operates the CRM directly, through the same ops layer the app uses.",
  },
];

export function WhyScalarSection() {
  return (
    <section id="why" className="relative scroll-mt-24 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-orange/80">Why Scalar</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            Everyone owns one piece.{" "}
            <span className="text-gradient-orange">Scalar owns all four.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Enrichment tools aren&apos;t a CRM. Modern CRMs are pretty but you still
            do the work. Legacy CRMs are heavy and agents can&apos;t drive them.
            Agent frameworks dump to markdown. Scalar is structure, UI,
            intelligence, and agent-native, as one system.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar, index) => (
            <motion.div
              key={pillar.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.08, ease: easeOut }}
              className="h-full"
            >
              <SpotlightCard className="h-full p-6">
                <span className="font-brand text-3xl text-orange tabular-nums">{pillar.n}</span>
                <h3 className="font-brand mt-3 text-xl text-foreground">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
