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

type Pt = [number, number];
function smooth(pts: Pt[]): string {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 8;
    const c1y = p1[1] + (p2[1] - p0[1]) / 8;
    const c2x = p2[0] - (p3[0] - p1[0]) / 8;
    const c2y = p2[1] - (p3[1] - p1[1]) / 8;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const AX = 300;
const DROP = 52;
const ORANGE = "#e2632f";

const CURRENT: Pt[] = [
  [0, 162],
  [40, 150],
  [80, 158],
  [120, 134],
  [160, 150],
  [200, 126],
  [240, 140],
  [280, 98],
  [AX, 110],
  [340, 158],
  [380, 146],
  [420, 160],
  [460, 144],
];

const PREVIOUS: Pt[] = [
  [0, 146],
  [40, 138],
  [80, 150],
  [120, 156],
  [160, 144],
  [200, 150],
  [240, 142],
  [280, 148],
  [AX, 152],
  [340, 170],
  [380, 152],
  [420, 176],
  [460, 158],
];

const drop = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x, y + DROP]);
const yAt = (pts: Pt[]) => drop(pts).find((p) => p[0] === AX)![1];

const CARD =
  "bg-linear-to-b from-white to-neutral-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),inset_0_2px_0_0_rgba(255,255,255,1),0_4px_12px_-7px_rgba(0,0,0,0.10)] dark:from-[#1c1c1c] dark:to-[#141414] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.05),0_20px_40px_-24px_rgba(0,0,0,0.8)]";

const ROWS = [
  { bar: ORANGE, label: "This week", value: "42" },
  { bar: null, label: "Last week", value: "29" },
];

const TrendLines = () => {
  return (
    <FitScale width={460} height={280}>
      <div className="relative h-full w-full">
        <svg
          viewBox="0 0 460 280"
          className="absolute inset-0 h-full w-full"
          fill="none"
        >
          <line
            x1={AX}
            y1="86"
            x2={AX}
            y2="280"
            className="stroke-neutral-300 dark:stroke-neutral-700"
            strokeWidth="1"
            strokeDasharray="3 4"
          />

          <path
            d={smooth(drop(PREVIOUS))}
            className="stroke-neutral-400 dark:stroke-neutral-600"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d={smooth(drop(CURRENT))}
            stroke={ORANGE}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <circle
            cx={AX}
            cy={yAt(PREVIOUS)}
            r="8"
            className="fill-neutral-500/15"
          />
          <circle
            cx={AX}
            cy={yAt(PREVIOUS)}
            r="4"
            className="fill-neutral-700 stroke-white dark:fill-neutral-200 dark:stroke-black"
            strokeWidth="2.5"
          />

          <circle
            cx={AX}
            cy={yAt(CURRENT)}
            r="11"
            fill={ORANGE}
            opacity="0.14"
          />
          <circle
            cx={AX}
            cy={yAt(CURRENT)}
            r="6.5"
            fill={ORANGE}
            opacity="0.24"
          />
          <circle
            cx={AX}
            cy={yAt(CURRENT)}
            r="4"
            fill={ORANGE}
            className="stroke-white dark:stroke-black"
            strokeWidth="2.5"
          />
        </svg>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-[linear-gradient(to_right,var(--color-white),transparent)] dark:bg-[linear-gradient(to_right,var(--color-black),transparent)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-[linear-gradient(to_left,var(--color-white),transparent)] dark:bg-[linear-gradient(to_left,var(--color-black),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]" />

        <div
          className={`absolute top-4 left-43 w-48 rounded-xl px-4 py-3.5 ${CARD}`}
        >
          <p className="mb-2.5 text-[12.5px] font-semibold text-neutral-900 dark:text-neutral-100">
            New sign-ups
          </p>
          <div className="space-y-2">
            {ROWS.map((r) => (
              <div key={r.label} className="flex items-center gap-2.5">
                <span
                  className={`h-3.5 w-0.75 shrink-0 rounded-full ${
                    r.bar ? "" : "bg-neutral-300 dark:bg-neutral-600"
                  }`}
                  style={r.bar ? { backgroundColor: r.bar } : undefined}
                />
                <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
                  {r.label}
                </span>
                <span className="ml-auto text-[12.5px] font-semibold text-neutral-900 tabular-nums dark:text-neutral-50">
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </FitScale>
  );
};

export default TrendLines;
