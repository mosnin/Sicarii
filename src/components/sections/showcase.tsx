"use client";

import { motion } from "motion/react";
import { ProductMock } from "@/components/marketing/product-mock";

const easeOut = [0.16, 1, 0.3, 1] as const;

// What the visitor is looking at in the mock above. Three plain reads, no
// placeholder tiles: the product shows itself, the captions just name the parts.
const reads = [
  {
    label: "Structured, not scattered",
    body: "Every company is a typed record - deduped, validated, and browsable. Not a folder of markdown.",
  },
  {
    label: "Enriched on the way in",
    body: "Firmographics, size, funding, and buying intent land as real fields the moment the agent runs.",
  },
  {
    label: "Operated by your agent",
    body: "The activity strip is live: the agent discovers, enriches, and writes the same CRM you can see.",
  },
];

export function ShowcaseSection() {
  return (
    <section className="relative scroll-mt-24 bg-muted/30 py-24 dark:bg-background sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">See it</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            A real CRM, <span className="text-gradient-orange">run by your agent</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Not another markdown folder. A structured database with a real
            interface, and an agent that operates it for you.
          </p>
        </div>

        <div className="mt-14 sm:mt-16">
          <ProductMock />
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
          {reads.map((read, index) => (
            <motion.div
              key={read.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1, ease: easeOut }}
            >
              <h3 className="font-brand text-base text-foreground">{read.label}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{read.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
