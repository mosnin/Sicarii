"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const values = [
  {
    title: "Owned data - never leaves your system",
    description:
      "Every contact, enrichment, and email thread lives in your Scalar database. No third-party scraping your CRM. No shared pool. It is yours.",
  },
  {
    title: "Radical transparency",
    description:
      "Every agent action is logged. Every write is reviewable. You always know exactly what the agents did - and you can roll it back.",
  },
  {
    title: "Deep product context",
    description:
      "Agents read your product knowledge base before they write a single word. Outreach is informed, not generic spray.",
  },
];

export function AboutSection() {
  return (
    <section id="about" className="relative scroll-mt-24 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-primary">About Scalar</p>
            <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
              The CRM for teams building in the{" "}
              <span className="text-gradient-orange">AI age</span>
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Scalar is a CRM whose operators are AI agents. They discover leads, enrich the
              database, run email relationships, and read/write every record - on data that
              never leaves the system.
            </p>
            <p className="mt-4 text-muted-foreground">
              For agencies, founders, and lean teams running outbound. The world changed; how
              you build relationships changed with it. Scalar gives your agents the context to
              sell with understanding - not just spray.
            </p>
            <Link
              href="/sign-up"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="space-y-4">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <SpotlightCard className="p-6">
                  <h3 className="font-brand text-lg text-foreground">{value.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{value.description}</p>
                </SpotlightCard>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
