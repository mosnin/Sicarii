"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AsciiField } from "@/components/dashboard/ascii-field";

// A shared template for the in-depth feature pages reached from the mega menu.
// Same visual language as the landing page (ASCII signature hero, baby-blue
// accents, font-brand headings), driven entirely by data so each page stays a
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
            initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative z-10 mx-auto max-w-4xl px-4 text-center"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-primary">{eyebrow}</p>
            <h1 className="font-brand mt-4 text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {title} <span className="text-gradient-orange">{accent}</span>
              {titleTail ? ` ${titleTail}` : ""}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{subtitle}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/#capabilities"
                className="rounded-full border border-border px-7 py-3 text-base font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                See all capabilities
              </Link>
            </div>
          </motion.div>
        </section>

        {/* In-depth blocks */}
        <section className="pb-4">
          <div className="mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:px-8">
            {blocks.map((b) => (
              <div
                key={b.title}
                className="rounded-3xl border border-border bg-card p-6 transition-shadow hover:shadow-lg hover:shadow-black/[0.05] sm:p-8"
              >
                <h3 className="font-brand text-xl text-foreground">{b.title}</h3>
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
                    <span className="font-brand text-2xl tabular-nums text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h4 className="font-brand text-lg text-foreground">{s.title}</h4>
                      <p className="mt-1.5 leading-relaxed text-muted-foreground">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {/* CTA */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="font-brand text-3xl tracking-tight text-foreground sm:text-4xl">
              {ctaTitle}
            </h2>
            <Link
              href="/sign-up"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40"
            >
              Get started
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
