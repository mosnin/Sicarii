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

const CARD =
  "bg-linear-to-b from-white to-neutral-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.09),0_5px_14px_-12px_rgba(0,0,0,0.10)] dark:from-[#1c1c1c] dark:to-[#141414] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.06),0_24px_48px_-26px_rgba(0,0,0,0.85)]";

const RULER_LEFT = 24;
const RULER_RIGHT = 496;
const TICK_COUNT = 40;
const TICK_STEP = (RULER_RIGHT - RULER_LEFT) / TICK_COUNT;
const tickX = (i: number) => RULER_LEFT + i * TICK_STEP;

const LABELS: { i: number; text: string }[] = [
  { i: 0, text: "MAY 1" },
  { i: 7, text: "8" },
  { i: 14, text: "15" },
  { i: 23, text: "24" },
  { i: 30, text: "JUN 1" },
];

const PLAYHEAD_X = 428;

const ROWS = [
  {
    title: "Finalize the release notes",
    range: "May 1 – Jun 8",
    left: 44,
    width: 258,
    top: 90,
    avatars: 3,
  },
  {
    title: "Sync the design tokens",
    range: "May 17 – Jun 2",
    left: 188,
    width: 250,
    top: 150,
    avatars: 1,
  },
  {
    title: "Publish the changelog",
    range: "May 6 – May 28",
    left: 90,
    width: 228,
    top: 210,
    avatars: 2,
  },
];

function Avatars({ count }: { count: number }) {
  return (
    <div className="flex items-center -space-x-2">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="size-6 rounded-full bg-linear-to-b from-neutral-100 to-neutral-300 ring-2 ring-white dark:from-neutral-700 dark:to-neutral-800 dark:ring-[#181818]"
          style={{ zIndex: count - i }}
        />
      ))}
    </div>
  );
}

const Timeline = () => {
  const playX = PLAYHEAD_X;

  return (
    <FitScale width={520} height={300}>
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="absolute h-px bg-neutral-200 dark:bg-neutral-800"
          style={{ left: RULER_LEFT, right: 520 - RULER_RIGHT, top: 60 }}
        />

        {Array.from({ length: TICK_COUNT + 1 }).map((_, i) => {
          const major = i % 7 === 0 || i === 23;
          return (
            <div
              key={i}
              className="absolute w-px bg-neutral-200 dark:bg-neutral-800"
              style={{
                left: tickX(i),
                top: major ? 52 : 55,
                height: major ? 8 : 5,
              }}
            />
          );
        })}

        {LABELS.map((l) => (
          <span
            key={l.i}
            className="absolute -translate-x-1/2 text-[9px] font-medium tracking-wide text-neutral-400 tabular-nums dark:text-neutral-500"
            style={{ left: tickX(l.i), top: 32 }}
          >
            {l.text}
          </span>
        ))}

        {ROWS.map((r) => (
          <div
            key={r.title}
            className={cn(
              "absolute z-10 flex items-center justify-between gap-4 rounded-xl px-4 py-2.5",
              CARD,
            )}
            style={{ left: r.left, top: r.top, width: r.width }}
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium tracking-tight text-neutral-800 dark:text-neutral-100">
                {r.title}
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-neutral-400 tabular-nums dark:text-neutral-500">
                {r.range}
              </p>
            </div>

            <Avatars count={r.avatars} />
          </div>
        ))}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 w-12 -translate-x-1/2 bg-orange-500/5 blur-2xl dark:bg-orange-500/12"
          style={{ left: playX, top: 34, bottom: 0 }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-30 w-px bg-orange-500/60 dark:bg-orange-400/70"
          style={{ left: playX, top: 28, bottom: 0 }}
        />

        <div
          className="absolute z-40 -translate-x-1/2 rounded-md bg-linear-to-b from-orange-500 to-orange-600 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_0_0_1px_rgba(255,255,255,0.12),0_4px_10px_-3px_rgba(234,88,12,0.2)]"
          style={{ left: playX, top: 6 }}
        >
          JUN 8
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-50 w-10 bg-linear-to-r from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-50 w-8 bg-linear-to-l from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-50 h-10 bg-linear-to-t from-white to-transparent dark:from-black"
        />
      </div>
    </FitScale>
  );
};

export default Timeline;
