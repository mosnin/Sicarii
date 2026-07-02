"use client";

/**
 * The product walkthrough as an ExpandableScreen (see DESIGN.md, Motion
 * Surfaces): a compact invitation card that morphs into a full-screen,
 * immersive Arcade demo. The iframe mounts only when expanded, so the
 * homepage no longer pays the embed's load cost up front.
 * demo.arcade.software is allow-listed in the CSP frame-src.
 */

import {
  ExpandableScreen,
  ExpandableScreenTrigger,
  ExpandableScreenContent,
} from "@/components/ui/expandable-screen";

export function ProductDemo() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">See it in action</p>
          <h2 className="font-brand mt-4 text-3xl tracking-tight text-foreground sm:text-4xl">
            Watch your agent set up a market scan
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            A real walkthrough: your agent configures an automated market scan with
            Radar, no setup call required.
          </p>
        </div>

        <ExpandableScreen layoutId="product-demo" triggerRadius="24px" contentRadius="24px">
          <div className="mt-10 flex justify-center">
            <ExpandableScreenTrigger
              className="w-full"
              bgClassName="border border-border bg-card shadow-lg shadow-black/10"
            >
              <div className="group flex w-full flex-col items-center gap-6 px-6 py-12 sm:flex-row sm:justify-between sm:px-10">
                <div className="text-center sm:text-left">
                  <p className="font-brand text-xl text-foreground sm:text-2xl">
                    The two-minute walkthrough
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Radar scan setup, from a plain-language prompt to a live monitor.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform group-hover:scale-105">
                  Watch the demo
                </span>
              </div>
            </ExpandableScreenTrigger>
          </div>

          <ExpandableScreenContent
            className="bg-card"
            closeButtonClassName="text-foreground bg-background/80 hover:bg-background border border-border"
          >
            <div className="flex h-full w-full flex-col p-4 pt-16 sm:p-8 sm:pt-16">
              <div className="mx-auto w-full max-w-6xl flex-1 overflow-hidden rounded-xl border border-border/60">
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
          </ExpandableScreenContent>
        </ExpandableScreen>
      </div>
    </section>
  );
}
