"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { DotFlow, type DotFlowProps } from "@/components/ui/dot-flow";
import { RotatingWord } from "@/components/ui/rotating-word";
import { ArrowRight } from "lucide-react";

// Compact dot-grid loops for the hero chip - the live work the agent does.
const designing = [
  [24],
  [17, 23, 25, 31],
  [10, 16, 18, 30, 32, 38],
  [9, 11, 37, 39, 3, 45],
  [10, 16, 18, 30, 32, 38],
  [17, 23, 25, 31],
];
const building = [
  [],
  [3],
  [10, 2, 4],
  [17, 9, 11, 5],
  [24, 16, 18, 12],
  [31, 23, 25, 19],
  [38, 30, 32, 26],
  [45, 37, 39, 33],
];
const shipping = [
  [14, 15, 16, 17, 18, 19, 20],
  [21, 22, 23, 24, 25, 26, 27],
  [28, 29, 30, 31, 32, 33, 34],
  [21, 22, 23, 24, 25, 26, 27],
];

const heroItems: DotFlowProps["items"] = [
  { title: "Discovering", frames: designing, repeatCount: 2, duration: 160 },
  { title: "Enriching", frames: building, repeatCount: 2, duration: 130 },
  { title: "Sensing intent", frames: shipping, repeatCount: 2, duration: 150 },
];

const easeOut = [0.16, 1, 0.3, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: easeOut } },
};

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Gentle parallax: the ASCII drifts up, the content lifts + fades as you scroll past.
  const asciiY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background pt-24"
    >
      <motion.div style={{ y: asciiY }} className="absolute inset-0">
        {/* ASCII field: low opacity in light, slightly higher in dark */}
        <AsciiField className="absolute inset-0 h-full w-full opacity-30 dark:opacity-25" cell={14} speed={0.09} gradient />
        {/* Radial glow tinted primary - reads on both white and dark */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(90,176,232,0.06),transparent_50%)]" />
      </motion.div>

      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8"
      >
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center gap-7"
        >
          <motion.p variants={item} className="text-xs uppercase tracking-[0.3em] text-orange/80">
            The CRM your agents run
          </motion.p>

          <motion.h1
            variants={item}
            className="font-brand text-4xl leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl"
          >
            <span className="block">
              <RotatingWord
                words={["Lead", "Company", "People", "Intent"]}
                className="text-gradient-orange"
              />
            </span>
            <span className="block">intelligence</span>
            <span className="block">at agent speed</span>
          </motion.h1>

          <motion.p variants={item} className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Point your agent at a name, a domain, or a prompt. It finds the right
            companies and people, surfaces who is in-market right now, and pulls
            deep enrichment - firmographics, tech stack, funding, news - in
            seconds. It all lands structured, deduped, and yours.
          </motion.p>

          <motion.div variants={item} className="mt-1 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-full bg-orange px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-orange/25 transition-all hover:bg-orange-dark hover:shadow-orange/40 hover:-translate-y-0.5"
            >
              Get started free
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-border px-8 py-3.5 text-base font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              See how it works
            </Link>
          </motion.div>

          <motion.div variants={item} className="mt-4">
            <DotFlow
              items={heroItems}
              className="border border-border bg-muted/50 px-4 py-2.5 backdrop-blur-md dark:bg-white/[0.04]"
              dotClassName="bg-foreground/15 [&.active]:bg-orange"
              textClassName="text-sm text-muted-foreground"
            />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
