"use client";

import { FitScale } from "./fit-scale";

/**
 * Signals, adapted from Forge UI `notification-stack`.
 *
 * The stock stack is consumer push noise (a ChatGPT update, a new follower) and
 * it sells *volume* — the opposite of what an intent feed should promise. This
 * one carries three signals, each with the reason it matters and the action it
 * already triggered, because "always-on monitors" is only a benefit if what
 * arrives is worth reading.
 */

type Signal = {
  kind: string;
  headline: string;
  why: string;
  when: string;
};

const SIGNALS: Signal[] = [
  {
    kind: "Funding",
    headline: "Ledgerline raised £12M Series A",
    why: "Budget just landed — reach them before the spend is committed.",
    when: "2h ago",
  },
  {
    kind: "Hiring",
    headline: "Northbank Pay opened 3 RevOps roles",
    why: "They are building the team that buys what you sell.",
    when: "Today",
  },
  {
    kind: "Tech change",
    headline: "Vaultpay moved off their billing stack",
    why: "Mid-migration is the one window where switching is cheap.",
    when: "Yesterday",
  },
];

export function SignalStack() {
  return (
    <FitScale width={580} height={364}>
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 px-10">
        {SIGNALS.map((s, i) => (
          <div
            key={s.headline}
            className="ss-card w-full max-w-[460px] rounded-xl border border-border bg-background px-4 py-3 shadow-sm"
            style={{ animationDelay: `${0.15 + i * 0.28}s` }}
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-primary">
                {s.kind}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">{s.when}</span>
            </div>
            <p className="mt-2 truncate text-[13.5px] font-medium text-foreground">
              {s.headline}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{s.why}</p>
          </div>
        ))}

        <div
          className="ss-card mt-1 flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 shadow-sm"
          style={{ animationDelay: "1.05s" }}
        >
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="text-[12px] font-medium text-foreground">
            All three written to your pipeline
          </span>
        </div>

        <style>{`
          .ss-card {
            opacity: 0;
            animation: ss-in .55s cubic-bezier(.16,1,.3,1) forwards;
          }
          @keyframes ss-in {
            from { opacity: 0; transform: translateY(10px) scale(.985); }
            to   { opacity: 1; transform: none; }
          }
          @media (prefers-reduced-motion: reduce) {
            .ss-card { animation: none; opacity: 1; transform: none; }
          }
        `}</style>
      </div>
    </FitScale>
  );
}
