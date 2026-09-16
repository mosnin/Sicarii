"use client";

import { FitScale } from "./fit-scale";

/**
 * Enrich, adapted from Forge UI `pagescan`.
 *
 * Two changes carry the page's argument. The stock illustration ends on a
 * "Scanning page…" spinner — the apparatus — so this one ends on the fields it
 * produced, each with the source it came from ("provenance on every field").
 * And its red/amber ambient orbs are gone: baby blue is the only accent.
 */

type Field = { label: string; value: string; source: string };

const FIELDS: Field[] = [
  { label: "Industry", value: "Fintech · Payments", source: "from the homepage" },
  { label: "Headcount", value: "180", source: "from the careers page" },
  { label: "Funding", value: "Series A · £12M", source: "from the announcement" },
  { label: "Work email", value: "verified", source: "SMTP checked" },
];

export function EnrichScan() {
  return (
    <FitScale width={580} height={340}>
      <div className="relative h-full w-full overflow-hidden">
        {/* Ambient tint — primary only. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 top-6 size-52 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -right-10 bottom-6 size-52 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="relative flex h-full w-full items-center justify-center gap-7 px-8">
          {/* The source being read. */}
          <div className="relative flex h-[232px] w-[236px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm">
            <div className="flex items-center gap-1.5 border-b border-border px-3.5 py-2.5">
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="ml-1.5 truncate text-[10.5px] text-muted-foreground">
                ledgerline.co.uk
              </span>
            </div>

            <div className="relative flex-1 overflow-hidden px-5 py-4">
              <div className="flex flex-col gap-2">
                <div className="h-3 w-24 rounded-sm bg-muted-foreground/25" />
                <div className="h-2 w-full rounded-sm bg-muted" />
                <div className="h-2 w-11/12 rounded-sm bg-muted" />
                <div className="h-2 w-3/4 rounded-sm bg-muted" />
                <div className="mt-1.5 h-3 w-20 rounded-sm bg-muted-foreground/25" />
                <div className="h-2 w-full rounded-sm bg-muted" />
                <div className="h-2 w-5/6 rounded-sm bg-muted" />
                <div className="h-2 w-2/3 rounded-sm bg-muted" />
              </div>

              <div className="es-beam pointer-events-none absolute inset-x-0 h-8 bg-[linear-gradient(to_bottom,transparent,rgba(90,176,232,0.22),transparent)]" />
            </div>
          </div>

          {/* The fields it produced. */}
          <div className="flex w-[228px] shrink-0 flex-col gap-2.5">
            {FIELDS.map((f, i) => (
              <div
                key={f.label}
                className="es-field rounded-lg border border-border bg-background px-3.5 py-2.5"
                style={{ animationDelay: `${0.55 + i * 0.32}s` }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    {f.label}
                  </span>
                  <span className="truncate text-[12.5px] font-medium text-foreground">
                    {f.value}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-primary">
                  <span className="size-1 shrink-0 rounded-full bg-primary" />
                  {f.source}
                </p>
              </div>
            ))}
          </div>
        </div>

        <style>{`
          .es-beam { top: 0; animation: es-scan 2.6s ease-in-out infinite; }
          @keyframes es-scan {
            0%   { top: -20%; opacity: 0; }
            12%  { opacity: 1; }
            88%  { opacity: 1; }
            100% { top: 100%; opacity: 0; }
          }
          .es-field {
            opacity: 0;
            animation: es-fill .5s cubic-bezier(.16,1,.3,1) forwards;
          }
          @keyframes es-fill {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: none; }
          }
          @media (prefers-reduced-motion: reduce) {
            .es-beam { animation: none; opacity: 0; }
            .es-field { animation: none; opacity: 1; transform: none; }
          }
        `}</style>
      </div>
    </FitScale>
  );
}
