"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { AsciiField } from "@/components/dashboard/ascii-field";

const easeOut = [0.16, 1, 0.3, 1] as const;

// Sits just under the hero: a clean, animated band (ASCII + brand glow) that
// puts the agent to work. The previous walking-crowd canvas was built for a
// full-viewport stage, so inside a card it rendered cut off and blurry; removed.
export function AgentCrowdSection() {
  return (
    <section className="relative z-10 mx-auto -mt-10 w-full max-w-6xl px-4 sm:-mt-16 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
        whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: easeOut }}
        className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
      >
        {/* ASCII texture + brand glow, same motif as the hero */}
        <AsciiField
          className="absolute inset-0 h-full w-full opacity-[0.14] dark:opacity-[0.10]"
          cell={14}
          speed={0.07}
          gradient
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.10),transparent_60%)]" />

        <div className="relative z-10 px-6 py-16 text-center sm:px-12 sm:py-24">
          <p className="text-xs uppercase tracking-[0.3em] text-orange/80">
            Put your agent to work
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl font-brand text-3xl leading-[1.08] tracking-tight text-foreground sm:text-5xl">
            Let your agent find the prospects and close the deals
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Scalar agents do the work for you: discovering leads, enriching every
            record, and running the conversations end to end, while you stay in
            control.
          </p>
          <div className="mt-7 flex justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-full bg-orange px-7 py-3 text-base font-semibold text-white shadow-lg shadow-orange/25 transition-all hover:-translate-y-0.5 hover:bg-orange-dark hover:shadow-orange/40"
            >
              Start closing
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
