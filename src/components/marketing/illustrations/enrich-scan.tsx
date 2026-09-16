"use client";

/**
 * Enrich — Forge UI `pagescan`, adapted.
 *
 * Vendor component kept whole: the card grid, the travelling scan beam and the
 * ten-blade spinner are all original. Its red and amber ambient orbs are now
 * the one brand accent, the beam pulses baby blue, and the status pill ends on
 * the fields produced rather than on "Scanning page…" — the apparatus is our
 * problem, the filled fields are the customer's benefit.
 */

import React from "react";

import { FitScale } from "./fit-scale";

function Spinner() {
  return (
    <span className="relative ml-1 inline-block size-4 text-primary">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className="ps-spin absolute top-1/2 left-1/2 w-1 rounded-full bg-current"
          style={{
            height: 1.5,
            transform: `translate(-50%, -50%) rotate(${i * 36}deg) translate(146%)`,
            animationDelay: `${-900 + i * 100}ms`,
          }}
        />
      ))}
    </span>
  );
}

export function EnrichScan() {
  return (
    <FitScale width={460} height={330}>
      <div className="relative h-full w-full overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute top-4 -left-10 size-52 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -right-10 bottom-6 size-52 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 620,
            height: 406,
            gridTemplateColumns: "150px 300px 150px",
            gridTemplateRows: "90px 206px 90px",
            gap: 10,
          }}
        >
          {Array.from({ length: 9 }).map((_, i) =>
            i === 4 ? (
              <div key={i} />
            ) : (
              <div
                key={i}
                className="rounded-2xl border border-border bg-background"
              />
            ),
          )}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(to_bottom,var(--card),transparent)]" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,var(--card),transparent)]" />
          <div className="absolute inset-y-0 left-0 w-16 bg-[linear-gradient(to_right,var(--card),transparent)]" />
          <div className="absolute inset-y-0 right-0 w-16 bg-[linear-gradient(to_left,var(--card),transparent)]" />
        </div>

        <div
          className="absolute flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm"
          style={{ top: 62, right: 80, bottom: 62, left: 80 }}
        >
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
          </div>

          <div className="relative flex-1 overflow-hidden px-6 py-4">
            <div className="flex flex-col gap-2">
              <div className="h-3 w-24 rounded-xs bg-muted-foreground/25" />
              <div className="h-2 w-full rounded-xs bg-muted" />
              <div className="h-2 w-11/12 rounded-xs bg-muted" />
              <div className="h-2 w-3/4 rounded-xs bg-muted" />
              <div className="mt-1.5 h-3 w-20 rounded-xs bg-muted-foreground/25" />
              <div className="h-2 w-full rounded-xs bg-muted" />
              <div className="h-2 w-5/6 rounded-xs bg-muted" />
              <div className="h-2 w-2/3 rounded-xs bg-muted" />
            </div>

            <div className="ps-scan pointer-events-none absolute inset-x-0 h-8 bg-[linear-gradient(to_bottom,transparent,rgba(90,176,232,0.22),transparent)]" />
          </div>
        </div>

        <div className="absolute bottom-11 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 shadow-sm">
          <Spinner />
          <span className="whitespace-nowrap text-xs font-medium text-foreground">
            Writing fields with provenance
          </span>
        </div>

        <style>{`
.ps-scan {
  top: 0;
  animation: ps-scanmove 2.6s ease-in-out infinite;
}
@keyframes ps-scanmove {
  0% { top: -20%; opacity: 0; }
  12% { opacity: 1; }
  88% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
.ps-spin {
  animation: ps-spin 1s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .ps-scan { animation: none; opacity: 0; }
  .ps-spin { animation: none; opacity: .5; }
}
@keyframes ps-spin {
  0% { opacity: 1; }
  100% { opacity: 0.15; }
}
        `}</style>
      </div>
    </FitScale>
  );
};

