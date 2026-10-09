"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AsciiField } from "@/components/dashboard/ascii-field";

// A shared template for the in-depth feature pages reached from the mega menu.
// Same visual language as the landing page (ASCII signature hero, baby-blue
// accents, semibold Inter headings), driven entirely by data so each page stays a
// thin content file. No decorative icon badges; the only icon is the functional
// arrow inside the CTAs.

const EASE = [0.16, 1, 0.3, 1] as const;

export type FeatureBlock = { title: string; body: string };
export type FeatureStep = { title: string; body: string };

export type FeaturePageProps = {
  eyebrow: string;
  /** Leading plain text of the headline. */
  title: string;
  /** The accent phrase, rendered in the baby-blue gradient. */
  accent: string;
  /** Optional plain text after the accent phrase. */
  titleTail?: string;
  subtitle: string;
  blocks: FeatureBlock[];
  steps?: FeatureStep[];
  /**
   * The proof, shown immediately under the hero: one illustration that lets a
   * visitor see the promise land before they read a single block. One per
   * page - a second one competes with it and both get scrolled past.
   */
  illustration?: React.ReactNode;
  /** Optional extra content rendered after the steps, before the CTA. */
  extra?: React.ReactNode;
  ctaTitle: string;
};

export function FeaturePage({
  eyebrow,
  title,
  accent,
  titleTail,
  subtitle,
  blocks,
  steps,
  illustration,
  extra,
  ctaTitle,
}: FeaturePageProps) {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 sm:py-32">
          <AsciiField
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.10] dark:opacity-[0.20]"
            cell={14}
            speed={0.06}
            gradient
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.12),transparent_55%)]" />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="relative z-10 mx-auto max-w-4xl px-4 text-center"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-fg-tertiary">{eyebrow}</p>
            <h1 className="font-semibold tracking-tight mt-4 text-4xl leading-[1.05] text-foreground sm:text-5xl lg:text-6xl">
              {title} <span className="text-gradient-orange">{accent}</span>
              {titleTail ? ` ${titleTail}` : ""}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{subtitle}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-primary px-5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/#capabilities"
                className="inline-flex h-10 items-center rounded-[8px] border border-border bg-background px-5 text-base font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-foreground"
              >
                See all capabilities
              </Link>
            </div>
          </motion.div>
        </section>

        {illustration}

        {/* In-depth blocks */}
        <section className="pb-4">
          <div className="mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:px-8">
            {blocks.map((b) => (
              <div
                key={b.title}
                className="rounded-[8px] border border-border bg-background p-6 transition-colors hover:border-border-strong sm:p-8"
              >
                <h3 className="text-xl font-medium text-foreground">{b.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works (optional) */}
        {steps && steps.length > 0 ? (
          <section className="py-16 sm:py-20">
            <div className="mx-auto max-w-3xl px-4">
              <ol className="space-y-8">
                {steps.map((s, i) => (
                  <li key={s.title} className="flex gap-5">
                    <span className="text-2xl font-semibold tabular-nums text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h4 className="text-lg font-medium text-foreground">{s.title}</h4>
                      <p className="mt-1.5 leading-relaxed text-muted-foreground">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {extra}

        {/* CTA */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="font-semibold tracking-tight text-3xl text-foreground sm:text-4xl">
              {ctaTitle}
            </h2>
            <Link
              href="/sign-up"
              className="mt-7 inline-flex h-10 items-center gap-2 rounded-[8px] bg-primary px-5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
              <ArrowRight className="h-4 w-4" strokeWidth={1.6} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
