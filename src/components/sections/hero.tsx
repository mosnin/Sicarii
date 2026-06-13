"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { RotatingWord } from "@/components/ui/rotating-word";
import { LiveDemo } from "@/components/marketing/live-demo";
import { ArrowRight } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE } },
};

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Gentle parallax: the ASCII drifts up as you scroll past. The content does not
  // fade, so the interactive demo stays usable while it is on screen.
  const asciiY = useTransform(scrollYProgress, [0, 1], [0, 160]);

  return (
    <section
      ref={ref}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 pb-24 pt-28 sm:px-6 sm:pt-32 lg:px-8"
    >
      <motion.div style={reduce ? undefined : { y: asciiY }} className="absolute inset-0">
        <AsciiField className="absolute inset-0 h-full w-full opacity-30 dark:opacity-25" cell={14} speed={0.09} gradient />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(90,176,232,0.05),transparent_55%)]" />
        {/* fade the field into the page so the demo below sits on clean ground */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 flex max-w-3xl flex-col items-center gap-6 text-center"
      >
        <motion.p variants={item} className="text-xs uppercase tracking-[0.3em] text-primary">
          The CRM your agents run
        </motion.p>

        <motion.h1
          variants={item}
          className="font-brand text-4xl leading-[1.05] tracking-tight text-foreground sm:text-6xl"
        >
          <span className="block">
            <RotatingWord words={["Lead", "Company", "People", "Intent"]} className="text-gradient-orange" />
          </span>
          <span className="block">intelligence at agent speed</span>
        </motion.h1>

        <motion.p variants={item} className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Point your agent at a name, a domain, or a prompt. It finds the right
          companies and people, surfaces who is in-market, and enriches every
          record. It all lands structured, deduped, and yours.
        </motion.p>

        <motion.div variants={item} className="mt-1 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40"
          >
            Get started
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/#how-it-works"
            className="inline-flex items-center gap-2 rounded-full border border-border px-8 py-3.5 text-base font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            See how it works
          </Link>
        </motion.div>
      </motion.div>

      {/* The live, interactive product demo: the CRM building itself. */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, filter: "blur(8px)" }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
        className="relative z-10 mt-14 w-full"
      >
        <LiveDemo />
      </motion.div>
    </section>
  );
}
