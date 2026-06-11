"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnimatedGroup } from "@/components/ui/animated-group";

// Homepage hero: a clean, centered statement with a framed product canvas left
// blank for an arcade.so demo embed. Navigation is the shared Header (rendered
// by the page) so the nav stays consistent sitewide. Colors come from the
// design tokens, so this is on the Scalar baby-blue/white palette by default.
const transitionVariants = {
  item: {
    hidden: { opacity: 0, filter: "blur(12px)", y: 12 },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: { type: "spring", bounce: 0.3, duration: 1.5 },
    },
  },
} as const;

const stagger = {
  container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.75 } } },
  ...transitionVariants,
};

export function HeroSection() {
  return (
    <section className="overflow-hidden">
      <div className="relative pt-32 sm:pt-40">
        {/* Soft radial wash up from the page background */}
        <div className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]" />

        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            <AnimatedGroup variants={stagger}>
              <h1 className="font-brand mx-auto mt-8 max-w-2xl text-balance text-5xl font-medium tracking-tight text-foreground md:text-6xl">
                Lead intelligence at agent speed
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-pretty text-lg text-muted-foreground">
                Point your agent at a name, a domain, or a prompt. It discovers the
                right companies, surfaces who is in-market, and enriches every
                record. Structured, deduped, and wholly yours.
              </p>
              <div className="mt-12 flex items-center justify-center gap-2">
                <div className="rounded-[14px] border border-border bg-foreground/10 p-0.5">
                  <Button asChild size="lg" className="rounded-xl px-5 text-base">
                    <Link href="/sign-up">
                      <span className="text-nowrap">Get started</span>
                    </Link>
                  </Button>
                </div>
                <Button asChild size="lg" variant="ghost" className="h-[42px] rounded-xl px-5 text-base">
                  <Link href="/#capabilities">
                    <span className="text-nowrap">See it work</span>
                  </Link>
                </Button>
              </div>
            </AnimatedGroup>
          </div>
        </div>

        {/* Product canvas: framed and intentionally blank, ready for an arcade.so demo */}
        <AnimatedGroup variants={stagger}>
          <div className="relative mt-12 overflow-hidden px-2 sm:mt-16 md:mt-20">
            <div
              aria-hidden
              className="absolute inset-0 z-10 bg-gradient-to-b from-transparent from-35% to-background"
            />
            <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-background p-4 shadow-lg shadow-black/10 ring-1 ring-background">
              {/*
                Arcade.so demo embeds here. When the demo is ready, drop the
                iframe inside the canvas below, e.g.:

                <iframe
                  src="https://demo.arcade.software/XXXXXXXX"
                  title="Scalar product demo"
                  loading="lazy"
                  allow="clipboard-write; fullscreen"
                  className="absolute inset-0 h-full w-full"
                />

                demo.arcade.software is already allow-listed in the CSP frame-src.
              */}
              <div className="relative aspect-[15/8] w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40" />
            </div>
          </div>
        </AnimatedGroup>
      </div>
    </section>
  );
}
