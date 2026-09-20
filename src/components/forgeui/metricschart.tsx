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

const BASE = 250;
const AX = 230;

const SERIES = [
  {
    key: "green",
    color: "#10b981",
    fill: "url(#mc-green)",
    pts: [
      [0, 196],
      [38, 189],
      [76, 192],
      [115, 175],
      [153, 166],
      [191, 168],
      [AX, 140],
      [268, 128],
      [306, 131],
      [345, 106],
      [383, 94],
      [421, 97],
      [460, 74],
    ] as Pt[],
  },
  {
    key: "red",
    color: "#ef4444",
    fill: "url(#mc-red)",
    pts: [
      [0, 214],
      [38, 208],
      [76, 210],
      [115, 197],
      [153, 189],
      [191, 191],
      [AX, 166],
      [268, 153],
      [306, 156],
      [345, 132],
      [383, 120],
      [421, 123],
      [460, 100],
    ] as Pt[],
  },
  {
    key: "gray",
    color: "#8b909a",
    fill: "url(#mc-gray)",
    pts: [
      [0, 230],
      [38, 225],
      [76, 227],
      [115, 215],
      [153, 208],
      [191, 210],
      [AX, 188],
      [268, 176],
      [306, 179],
      [345, 156],
      [383, 145],
      [421, 148],
      [460, 126],
    ] as Pt[],
  },
];

const ROWS = [
  { color: "#10b981", label: "Active users", value: "2,480" },
  { color: "#ef4444", label: "New signups", value: "1,320" },
  { color: "#8b909a", label: "Upgrades", value: "640" },
];

const CARD =
  "bg-linear-to-b from-white to-neutral-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),inset_0_2px_0_0_rgba(255,255,255,1),0_4px_12px_-7px_rgba(0,0,0,0.10)] dark:from-[#1c1c1c] dark:to-[#141414] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.05),0_20px_40px_-24px_rgba(0,0,0,0.8)]";

const MetricsChart = () => {
  return (
    <FitScale width={460} height={260}>
      <div className="relative h-full w-full">
        <svg
          viewBox="0 0 460 260"
          className="absolute inset-0 h-full w-full"
          fill="none"
        >
          <defs>
            <linearGradient id="mc-green" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="mc-red" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="mc-gray" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b909a" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#8b909a" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[...SERIES].reverse().map((s) => (
            <path
              key={`area-${s.key}`}
              d={`${smooth(s.pts)} L 460 ${BASE} L 0 ${BASE} Z`}
              fill={s.fill}
            />
          ))}

          {[...SERIES].reverse().map((s) => (
            <path
              key={`line-${s.key}`}
              d={smooth(s.pts)}
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          <line
            x1={AX}
            y1="0"
            x2={AX}
            y2="260"
            className="stroke-neutral-300 dark:stroke-neutral-700"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {SERIES.map((s) => {
            const y = s.pts.find((p) => p[0] === AX)![1];
            return (
              <circle
                key={`dot-${s.key}`}
                cx={AX}
                cy={y}
                r="4"
                fill={s.color}
                className="stroke-white dark:stroke-black"
                strokeWidth="2.5"
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-[linear-gradient(to_right,var(--color-white),transparent)] dark:bg-[linear-gradient(to_right,var(--color-black),transparent)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-[linear-gradient(to_left,var(--color-white),transparent)] dark:bg-[linear-gradient(to_left,var(--color-black),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[linear-gradient(to_bottom,var(--color-white),transparent)] dark:bg-[linear-gradient(to_bottom,var(--color-black),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]" />

        <div
          className={`absolute top-14 left-10 w-44 rounded-xl px-3.5 py-3 ${CARD}`}
        >
          <div className="space-y-2">
            {ROWS.map((r) => (
              <div key={r.label} className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
                  {r.label}
                </span>
                <span className="ml-auto text-[12px] font-semibold text-neutral-900 tabular-nums dark:text-neutral-50">
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

export default MetricsChart;
