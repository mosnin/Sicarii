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
          <p className="text-xs font-medium uppercase tracking-wide text-fg-tertiary">See it in action</p>
          <h2 className="font-semibold tracking-tight mt-4 text-3xl text-foreground sm:text-4xl">
            Watch your agent set up a market scan
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            A real walkthrough: your agent configures an automated market scan with
            Radar, no setup call required.
          </p>
        </div>

        <ExpandableScreen layoutId="product-demo" triggerRadius="12px" contentRadius="12px">
          <div className="mt-10 flex justify-center">
            <ExpandableScreenTrigger
              className="w-full"
              bgClassName="border border-border bg-card"
            >
              <div className="group flex w-full flex-col items-center gap-6 px-6 py-12 sm:flex-row sm:justify-between sm:px-10">
                <div className="text-center sm:text-left">
                  <p className="text-xl font-medium text-foreground sm:text-2xl">
                    The two-minute walkthrough
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Radar scan setup, from a plain-language prompt to a live monitor.
                  </p>
                </div>
                <span className="inline-flex h-9 shrink-0 items-center rounded-[8px] bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors group-hover:bg-primary/90">
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
              <div className="mx-auto w-full max-w-6xl flex-1 overflow-hidden rounded-[8px] border border-border">
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
