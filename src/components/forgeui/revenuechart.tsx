"use client";

import { cn } from "@/lib/utils";
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

const BARS = [104, 120, 110, 92, 168, 120, 98];
const HIGHLIGHT = 4;

const CARD =
  "bg-linear-to-b from-white to-neutral-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),inset_0_2px_0_0_rgba(255,255,255,1),0_4px_12px_-7px_rgba(0,0,0,0.10)] dark:from-[#1c1c1c] dark:to-[#141414] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.05),0_20px_40px_-24px_rgba(0,0,0,0.8)]";

const RevenueChart = () => {
  return (
    <FitScale width={460} height={280}>
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-4">
          {BARS.map((h, i) => {
            const active = i === HIGHLIGHT;
            return (
              <div key={i} className="relative flex items-end">
                {active && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-1/2 h-52 w-40 -translate-x-1/2 rounded-full bg-emerald-500/25 blur-3xl"
                  />
                )}
                <div
                  style={{ height: h }}
                  className={cn(
                    "relative w-10 rounded-t-md",
                    active
                      ? "bg-linear-to-b from-emerald-600 via-emerald-500 to-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                      : "bg-linear-to-b from-neutral-200 to-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_0_0_1px_rgba(0,0,0,0.05)] dark:from-neutral-800 dark:to-neutral-900/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                  )}
                />
              </div>
            );
          })}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-linear-to-r from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-linear-to-l from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-linear-to-t from-white to-transparent dark:from-black"
        />

        <div
          className={cn(
            "absolute top-10 left-6 z-20 rounded-xl px-3.5 py-2.5",
            CARD,
          )}
        >
          <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
            Monthly revenue
          </p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight text-neutral-900 tabular-nums dark:text-neutral-50">
            $48,120.75
          </p>
          <p className="mt-1 text-[10px] font-medium text-emerald-500">
            +38% vs. last month
          </p>
        </div>
      </div>
    </FitScale>
  );
};

export default RevenueChart;
