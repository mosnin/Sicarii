"use client";

import { motion } from "motion/react";

const stats = [
  { value: "MCP", label: "Bring your own agent, or use ours" },
  { value: "1", label: "Source of truth, deduped on the way in" },
  { value: "0", label: "Wrong-person matches: accuracy over coverage" },
  { value: "Yours", label: "Owned, exportable, never resold or trained" },
];

export function StatsBand() {
  return (
    <section className="border-y border-border bg-muted/30 py-14 dark:bg-charcoal-dark">
      <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-14 gap-y-8 px-4 sm:gap-x-20">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
            className="text-center"
          >
            <p className="font-brand text-3xl text-foreground sm:text-4xl">{stat.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
