"use client";

import { FitScale } from "./fit-scale";

/**
 * Discover, adapted from Forge UI `agentresearch`.
 *
 * The stock illustration ends on a pair of *articles* — which is precisely the
 * thing Scalar promises not to return. So the results here are typed company
 * records with a domain and firmographics, and one of them is a dedupe skip:
 * the page's two hardest claims ("real companies, not articles" and "deduped
 * by default") are shown rather than asserted.
 */

const SearchGlyph = ({ className = "" }) => (
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
          className="dr-dot size-[3px] rounded-full bg-primary/70"
          style={{ animationDelay: `${(r + c) * 0.13}s` }}
        />
      )),
    )}
  </span>
);

type Row = {
  name: string;
  domain: string;
  meta: string;
  state: "new" | "duplicate";
};

/**
 * Illustrative companies, deliberately invented. Naming real businesses here
 * would read as a claim about who is in someone's CRM.
 */
const ROWS: Row[] = [
  {
    name: "Ledgerline",
    domain: "ledgerline.co.uk",
    meta: "Fintech · London · 180 staff · Series A",
    state: "new",
  },
  {
    name: "Northbank Pay",
    domain: "northbankpay.com",
    meta: "Payments · Manchester · 94 staff · Series A",
    state: "new",
  },
  {
    name: "Vaultpay",
    domain: "vaultpay.io",
    meta: "Already in your CRM — skipped, not duplicated",
    state: "duplicate",
  },
];

const ResultRow = ({ name, domain, meta, state }: Row) => (
  <div className="flex items-start gap-2.5">
    <span
      className={`mt-[7px] size-1.5 shrink-0 rounded-full ${
        state === "new" ? "bg-primary" : "bg-muted-foreground/40"
      }`}
    />
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
        <p className="truncate text-[12px] text-muted-foreground">{domain}</p>
      </div>
      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{meta}</p>
    </div>
    <span
      className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider ${
        state === "new"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {state === "new" ? "Added" : "Deduped"}
    </span>
  </div>
);

export function DiscoverResearch() {
  return (
    <FitScale width={580} height={380}>
      <div className="relative h-full w-full">
        <div className="mx-auto w-[520px] pt-3">
          {/* The ask, in plain English. */}
          <div className="flex flex-col items-end">
            <div className="w-fit max-w-[360px] rounded-2xl rounded-br-sm border border-border bg-muted px-4 py-3">
              <p className="text-sm leading-relaxed text-foreground">
                Find Series A fintechs in the UK hiring RevOps.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <PulseDots />
            <span>Planned in 4s</span>
          </div>

          <p className="mt-3 text-[13.5px] leading-[1.55] text-muted-foreground">
            On it — real companies only, each checked against your CRM by domain.
          </p>

          <div className="mt-4 flex flex-col items-start gap-2.5 rounded-t-xl border border-b-0 border-border bg-background">
            <div className="flex w-full gap-2.5 border-b border-border px-4 py-3">
              <SearchGlyph className="size-[18px] shrink-0 text-primary" />
              <span className="truncate text-[13.5px] text-foreground">
                Series A · fintech · United Kingdom · hiring RevOps
              </span>
            </div>

            <div className="mt-1 w-full space-y-3.5 px-4 pb-2">
              {ROWS.map((r) => (
                <ResultRow key={r.domain} {...r} />
              ))}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes dr-pulse { 0%, 100% { opacity: .2 } 50% { opacity: .95 } }
          .dr-dot { animation: dr-pulse 1.5s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .dr-dot { animation: none; opacity: .6; }
          }
        `}</style>
      </div>
    </FitScale>
  );
}
