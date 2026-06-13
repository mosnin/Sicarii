"use client";

import { motion } from "motion/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const easeOut = [0.16, 1, 0.3, 1] as const;

// The two sides of the same coin: what an agent's work looks like without a real
// home, and what it looks like with one. No icons-in-boxes (design rule); the
// contrast carries the point.
const without = [
  "Output rots in scattered .md files",
  "No schema, no dedup, no UI",
  "Re-researches the same company twice",
  "Contradicts itself, and you can't trust it",
];
const withScalar = [
  "Typed entities, contacts, deals, memory",
  "Deduped and validated on the way in",
  "A real interface you can see and trust",
  "Every record compounds the next action",
];

export function ProblemSection() {
  return (
    <section className="relative scroll-mt-24 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">The problem</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            Agents are brilliant at doing.{" "}
            <span className="text-gradient-orange">Terrible at remembering.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Your agent researches a company, then forgets it. The work ends up in
            scattered files with no structure you can browse or trust. Agents
            without a database are goldfish with PhDs.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: easeOut }}
          >
            <SpotlightCard className="h-full p-7">
              <p className="font-brand text-sm uppercase tracking-[0.2em] text-muted-foreground">
                Without a real CRM
              </p>
              <ul className="mt-5 space-y-3">
                {without.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {line}
                  </li>
                ))}
              </ul>
            </SpotlightCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
          >
            <SpotlightCard className="h-full p-7">
              <p className="font-brand text-sm uppercase tracking-[0.2em] text-primary">
                With Scalar
              </p>
              <ul className="mt-5 space-y-3">
                {withScalar.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-sm text-foreground/80">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {line}
                  </li>
                ))}
              </ul>
            </SpotlightCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
