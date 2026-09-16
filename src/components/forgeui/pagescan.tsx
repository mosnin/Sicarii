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

function Spinner() {
  return (
    <span className="relative ml-1 inline-block size-4 text-neutral-400 dark:text-neutral-500">
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

const PageScan = () => {
  return (
    <FitScale width={460} height={330}>
      <div className="relative h-full w-full overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute top-4 -left-10 size-52 rounded-full bg-red-400/25 blur-3xl dark:bg-red-500/15" />
          <div className="absolute -right-10 bottom-6 size-52 rounded-full bg-amber-400/25 blur-3xl dark:bg-amber-500/12" />
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
                className="rounded-2xl border border-neutral-200/70 bg-white dark:border-neutral-800/50 dark:bg-[#0b0b0b]"
              />
            ),
          )}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(to_bottom,var(--color-white),transparent)] dark:bg-[linear-gradient(to_bottom,var(--color-black),transparent)]" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]" />
          <div className="absolute inset-y-0 left-0 w-16 bg-[linear-gradient(to_right,var(--color-white),transparent)] dark:bg-[linear-gradient(to_right,var(--color-black),transparent)]" />
          <div className="absolute inset-y-0 right-0 w-16 bg-[linear-gradient(to_left,var(--color-white),transparent)] dark:bg-[linear-gradient(to_left,var(--color-black),transparent)]" />
        </div>

        <div
          className="absolute flex flex-col overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-[0_14px_34px_-26px_rgba(0,0,0,0.22)] dark:border-neutral-800 dark:bg-[#0b0b0b]"
          style={{ top: 62, right: 80, bottom: 62, left: 80 }}
        >
          <div className="flex items-center gap-1.5 border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800/80">
            <span className="size-2 rounded-full bg-neutral-200 dark:bg-neutral-700" />
            <span className="size-2 rounded-full bg-neutral-200 dark:bg-neutral-700" />
            <span className="size-2 rounded-full bg-neutral-200 dark:bg-neutral-700" />
          </div>

          <div className="relative flex-1 overflow-hidden px-6 py-4">
            <div className="flex flex-col gap-2">
              <div className="h-3 w-24 rounded-xs bg-neutral-300 dark:bg-neutral-700" />
              <div className="h-2 w-full rounded-xs bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-2 w-11/12 rounded-xs bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-2 w-3/4 rounded-xs bg-neutral-200 dark:bg-neutral-800" />
              <div className="mt-1.5 h-3 w-20 rounded-xs bg-neutral-300 dark:bg-neutral-700" />
              <div className="h-2 w-full rounded-xs bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-2 w-5/6 rounded-xs bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-2 w-2/3 rounded-xs bg-neutral-200 dark:bg-neutral-800" />
            </div>

            <div className="ps-scan pointer-events-none absolute inset-x-0 h-8 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.07),transparent)] dark:bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.08),transparent)]" />
          </div>
        </div>

        <div className="absolute bottom-11 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-3.5 py-2 shadow-[0_5px_14px_-8px_rgba(0,0,0,0.16)] dark:border-neutral-800 dark:bg-[#0b0b0b]">
          <Spinner />
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Scanning page…
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
@keyframes ps-spin {
  0% { opacity: 1; }
  100% { opacity: 0.15; }
}
        `}</style>
      </div>
    </FitScale>
  );
};

export default PageScan;
