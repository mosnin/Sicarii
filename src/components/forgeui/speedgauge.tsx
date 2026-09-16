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

const CX = 180;
const CY = 168;
const R_OUT = 112;
const A0 = -120;
const SWEEP = 240;
const N = 40;
const REST = -80;

const NEEDLE_COLOR = "#4fc985";

const GREEN = "#73cb98";
const YELLOW = "#ffb340";
const RED = "#f55656";
const EDGE = 6;

function polar(d: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;

  const round = (n: number) => +n.toFixed(3);
  return [round(CX + d * Math.sin(a)), round(CY - d * Math.cos(a))];
}

function lerpHex(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) =>
    parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = (i: number) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t);
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(0))}${to2(mix(1))}${to2(mix(2))}`;
}

function rampColor(t: number): string {
  if (t <= 0.3) return GREEN;
  if (t <= 0.38) return lerpHex(GREEN, YELLOW, (t - 0.3) / 0.08);
  if (t <= 0.6) return YELLOW;
  if (t <= 0.68) return lerpHex(YELLOW, RED, (t - 0.6) / 0.08);
  return RED;
}

const TICKS = Array.from({ length: N + 1 }, (_, i) => {
  const t = i / N;
  const deg = A0 + t * SWEEP;
  const major = i % 5 === 0;
  const [x1, y1] = polar(major ? 92 : 100, deg);
  const [x2, y2] = polar(R_OUT, deg);
  const edgeFade = Math.min(1, (Math.min(i, N - i) + 0.5) / EDGE);
  return {
    x1,
    y1,
    x2,
    y2,
    w: major ? 3 : 2,
    color: rampColor(t),
    op: +((major ? 0.95 : 0.42) * edgeFade).toFixed(3),
  };
});

const SpeedGauge = () => {
  return (
    <FitScale width={360} height={250}>
      <div className="relative h-full w-full">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full blur-2xl dark:hidden"
          style={{
            left: 55,
            top: 28,
            width: 250,
            height: 205,
            background:
              "radial-gradient(closest-side, rgba(30,30,35,0.04), transparent 70%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute hidden rounded-full blur-2xl dark:block"
          style={{
            left: 42,
            top: 14,
            width: 276,
            height: 236,
            background:
              "radial-gradient(closest-side, rgba(210,210,220,0.05), transparent 72%)",
          }}
        />

        <svg
          viewBox="0 0 360 250"
          className="absolute inset-0 h-full w-full text-neutral-800 dark:text-white"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sp-needle" x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor={NEEDLE_COLOR} stopOpacity="0.55" />
              <stop offset="58%" stopColor={NEEDLE_COLOR} stopOpacity="1" />
              <stop offset="84%" stopColor="currentColor" />
              <stop offset="100%" stopColor="currentColor" />
            </linearGradient>
            <radialGradient id="sp-ball" cx="0.36" cy="0.31" r="0.85">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#f3f4f7" />
              <stop offset="70%" stopColor="#d2d4db" />
              <stop offset="100%" stopColor="#a6a8b2" />
            </radialGradient>
            <radialGradient id="sp-halo" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sp-shadow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
          </defs>

          {TICKS.map((tk, i) => (
            <line
              key={i}
              x1={tk.x1}
              y1={tk.y1}
              x2={tk.x2}
              y2={tk.y2}
              stroke={tk.color}
              strokeWidth={tk.w}
              strokeOpacity={tk.op}
              strokeLinecap="round"
            />
          ))}

          <polygon
            points="177,168 183,168 180,72"
            fill="url(#sp-needle)"
            strokeLinejoin="round"
            transform={`rotate(${REST} ${CX} ${CY})`}
          />

          <ellipse cx={CX} cy={CY + 13} rx={15} ry={5} fill="url(#sp-shadow)" />
          <circle cx={CX} cy={CY} r={22} fill="url(#sp-halo)" />
          <circle cx={CX} cy={CY} r={12} fill="url(#sp-ball)" />
          <ellipse cx={CX - 3.6} cy={CY - 3.6} rx={3} ry={2.2} fill="#ffffff" />
        </svg>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-linear-to-b from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-linear-to-r from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-linear-to-l from-white to-transparent dark:from-black"
        />
      </div>
    </FitScale>
  );
};

export default SpeedGauge;
