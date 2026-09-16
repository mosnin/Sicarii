"use client";

/**
 * Discover - Forge UI `agentresearch`, adapted.
 *
 * A copy of the vendor component with its layout, shadows and pulse animation
 * intact; only content and colour changed. The stock version resolves to two
 * blog articles, which is the exact thing Discover promises never to return,
 * so the results are company records and one of them is a dedupe skip.
 * Company names are invented - naming real businesses would read as a claim
 * about whose CRM they are in.
 */

import React from "react";

import { FitScale } from "./fit-scale";

const Search = ({ className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5 21 21" />
  </svg>
);

const PulseDots = () => (
  <span className="grid shrink-0 grid-cols-3 gap-0.5">
    {[0, 1, 2].map((r) =>
      [0, 1, 2].map((c) => (
        <span
          key={`${r}-${c}`}
          className="ar-dot size-0.75 rounded-full bg-primary/70"
          style={{ animationDelay: `${(r + c) * 0.13}s` }}
        />
      )),
    )}
    <style>{`@keyframes ar-pulse{0%,100%{opacity:.2}50%{opacity:.95}}.ar-dot{animation:ar-pulse 1.5s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.ar-dot{animation:none;opacity:.6}}`}</style>
  </span>
);

const Branch = ({ className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 5v6a3 3 0 0 0 3 3h11" />
    <path d="m15 10 5 4-5 4" />
  </svg>
);

const Result = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="flex items-start gap-2.5">
    <Branch className="mt-0.5 size-4 shrink-0 text-primary" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-medium text-foreground">
        {title}
      </p>
      <p className="mt-1 truncate text-[12px] text-muted-foreground">
        {subtitle}
      </p>
    </div>
  </div>
);

export function DiscoverResearch() {
  return (
    <FitScale width={580} height={440}>
      <div className="relative h-full w-full">
        <div className="mx-auto w-130 pt-7">
          <div className="flex flex-col items-end">
            <div className="w-fit max-w-90 rounded-2xl rounded-br-sm bg-muted px-4 py-3 border border-border">
              <p className="text-sm leading-relaxed text-foreground">
                Series B fintech in New York, hiring RevOps.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <PulseDots />
            <span>Planned in 4s</span>
          </div>

          <p className="mt-3 text-[13.5px] leading-[1.55] text-muted-foreground">
            On it - real companies only, each checked against your CRM by
            domain before anything is written.
          </p>

          <div className="mt-4 flex flex-col items-start gap-2.5 rounded-t-xl border border-b-0 border-border bg-card">
            <div className="flex w-full gap-2.5 border-b px-4 py-3">
              <Search className="size-4.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-[13.5px] text-foreground">
                Series B · fintech · New York · hiring RevOps
              </span>
            </div>

            <div className="mt-2 space-y-3.5 px-4">
              <Result
                title="Northwind Pay  ·  northwindpay.com"
                subtitle="Payments · New York · 180 staff · Series B. Added with 4 contacts."
              />
              <Result
                title="Cedar Capital  ·  cedarcapital.co"
                subtitle="Fintech · New York · 94 staff · Series B. Added with 2 contacts."
              />
              <Result
                title="Ledgerline  ·  ledgerline.io"
                subtitle="Already in your CRM. Skipped, not duplicated."
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-[linear-gradient(to_top,var(--card),transparent)]" />
      </div>
    </FitScale>
  );
};

