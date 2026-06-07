"use client";

import { motion } from "motion/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const easeOut = [0.16, 1, 0.3, 1] as const;

// The depth and speed that the word "CRM" hides. Each is something an agent
// returns in seconds, from a name, a domain, or a prompt. Buying intent is the
// accent - it is the signal nobody else surfaces this fast.
const dimensions = [
  { label: "Firmographics", body: "Size, industry, location, and the shape of the business." },
  { label: "Tech stack", body: "What they run, so your agent leads with relevance." },
  { label: "Funding", body: "Rounds and timing - reach out when the budget lands." },
  { label: "Web traffic", body: "Growth and momentum, read at a glance." },
  { label: "Recent news", body: "The triggers worth a first line." },
  { label: "Decision-makers", body: "The right people, with verified email and mobile." },
  { label: "Buying intent", body: "Who is actively looking for what you sell, right now." },
  { label: "Deep research", body: "Sourced answers to the questions that actually close." },
];

export function IntelligenceSection() {
  return (
    <section id="intelligence" className="relative scroll-mt-24 bg-muted/30 py-24 dark:bg-background sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-orange/80">Intelligence &amp; intent</p>
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

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dimensions.map((d, index) => (
            <motion.div
              key={d.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.06, ease: easeOut }}
              className="h-full"
            >
              <SpotlightCard className="h-full p-6">
                <h3 className="font-brand text-lg text-foreground">{d.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.body}</p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground"
        >
          Noisy results are refined into real, deduped companies - never
          aggregators, never the wrong person. Accuracy beats coverage, always.
        </motion.p>
      </div>
    </section>
  );
}
