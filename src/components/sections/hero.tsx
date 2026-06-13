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

        {/* Product canvas: the live arcade.so demo */}
        <AnimatedGroup variants={stagger}>
          <div className="relative mt-12 px-2 sm:mt-16 md:mt-20">
            <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-background p-2 shadow-lg shadow-black/10 ring-1 ring-background sm:p-4">
              <div className="overflow-hidden rounded-xl border border-border/60">
                {/* Arcade responsive embed: padding-bottom preserves the demo's
                    native aspect ratio; the iframe fills it absolutely. */}
                <div style={{ position: "relative", paddingBottom: "calc(49.26605504587156% + 41px)", height: 0, width: "100%" }}>
                  <iframe
                    src="https://demo.arcade.software/yzXGKtd6gmfShw2bUbEA?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true"
                    title="Set Up Automated Market Scans with Radar"
                    frameBorder="0"
                    loading="lazy"
                    allowFullScreen
                    allow="clipboard-write"
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", colorScheme: "light" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </AnimatedGroup>
      </div>
    </section>
  );
}
