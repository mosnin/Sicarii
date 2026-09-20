"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function FitScale({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div
      ref={ref}
      className="relative flex w-full justify-center overflow-hidden"
      style={{ height: (scale || 1) * height, visibility: scale ? "visible" : "hidden" }}
    >
      <div
        className="relative shrink-0"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

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
          className="ar-dot size-0.75 rounded-full bg-neutral-400 dark:bg-neutral-500"
          style={{ animationDelay: `${(r + c) * 0.13}s` }}
        />
      )),
    )}
    <style>{`@keyframes ar-pulse{0%,100%{opacity:.2}50%{opacity:.95}}.ar-dot{animation:ar-pulse 1.5s ease-in-out infinite}`}</style>
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
    <Branch className="mt-0.5 size-4 shrink-0 text-neutral-400 dark:text-neutral-600" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
        {title}
      </p>
      <p className="mt-1 truncate text-[12px] text-neutral-400 dark:text-neutral-500">
        {subtitle}
      </p>
    </div>
  </div>
);

const AgentResearch = () => {
  return (
    <FitScale width={580} height={380}>
      <div className="relative h-full w-full">
        <div className="mx-auto w-130 pt-7">
          <div className="flex flex-col items-end">
            <div className="w-fit max-w-90 rounded-2xl rounded-br-sm bg-linear-to-b from-white to-neutral-100 px-4 py-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.03),inset_0_0_0_1px_rgba(0,0,0,0.07),0_5px_14px_-6px_rgba(0,0,0,0.08)] dark:from-[#262626] dark:to-[#1c1c1c] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.05),0_12px_22px_-10px_rgba(0,0,0,0.6)]">
              <p className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                Find me a standing desk under $400.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 text-[12.5px] text-neutral-400 dark:text-neutral-500">
            <PulseDots />
            <span>Planned for 12s</span>
          </div>

          <p className="mt-3 text-[13.5px] leading-[1.55] text-neutral-600 dark:text-neutral-300">
            On it — I&apos;ll compare the top-rated options and pull out the
            best value picks for a small home office.
          </p>

          <div className="mt-4 flex flex-col items-start gap-2.5 rounded-t-xl border border-b-0 border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
            <div className="flex w-full gap-2.5 border-b px-4 py-3">
              <Search className="size-4.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
              <span className="truncate text-[13.5px] text-neutral-700 dark:text-neutral-200">
                Best budget standing desks under $400 — 2026 picks
              </span>
            </div>

            <div className="mt-2 space-y-3.5 px-4">
              <Result
                title="The 7 Best Standing Desks of 2026"
                subtitle="Tested for stability, height range, and overall build quality."
              />
              <Result
                title="Standing Desk Buying Guide — What to Look For"
                subtitle="Motor types, warranties, and the specs that actually matter."
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]" />
      </div>
    </FitScale>
  );
};

export default AgentResearch;
