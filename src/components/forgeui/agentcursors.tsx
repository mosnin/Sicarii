"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  LuMousePointer2,
  LuBug,
  LuFlaskConical,
  LuHammer,
} from "react-icons/lu";

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

const W = 560;
const H = 380;

const CHARSET = ["0", "1"];
const COLS = 34;
const ROWS = 18;

function cellHash(r: number, c: number): number {
  const h = (r * 73856093) ^ (c * 19349663) ^ (r * c * 83492791);
  return h >>> 0;
}

function CodeRain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 grid font-mono text-[11px] leading-none select-none"
      style={{
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      {Array.from({ length: ROWS * COLS }).map((_, i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const h = cellHash(r, c);
        const blank = (h >> 6) % 4 === 0;

        const bright = (h >> 11) % 6 === 0;
        const op = bright ? 0.34 : 0.09 + ((h >> 3) % 6) * 0.022;
        return (
          <span
            key={i}
            className="flex items-center justify-center text-neutral-400 dark:text-neutral-500"
            style={{ opacity: blank ? 0 : op }}
          >
            {blank ? "" : CHARSET[h % CHARSET.length]}
          </span>
        );
      })}
    </div>
  );
}

const PILL =
  "bg-linear-to-b from-white to-neutral-50 shadow-[inset_0_1px_0_rgba(0,0,0,0.02),inset_0_0_0_1px_rgba(0,0,0,0.07),0_6px_16px_-8px_rgba(0,0,0,0.18)] dark:from-[#232323] dark:to-[#1a1a1a] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.06),0_18px_36px_-18px_rgba(0,0,0,0.85)]";

type Tag = {
  x: number;
  y: number;
  rot: number;
  color: string;
  icon: IconType;
  label: string;
};

const TAGS: Tag[] = [
  { x: 60, y: 74, rot: -6, color: "#ef4444", icon: LuBug, label: "Debugger" },
  {
    x: 342,
    y: 150,
    rot: 6,
    color: "#f59e0b",
    icon: LuHammer,
    label: "Builder",
  },
  {
    x: 150,
    y: 252,
    rot: -3,
    color: "#22c55e",
    icon: LuFlaskConical,
    label: "Tester",
  },
];

function AgentTag({ x, y, rot, color, icon: Icon, label }: Tag) {
  return (
    <div className="absolute" style={{ left: x, top: y }}>
      <LuMousePointer2
        className="absolute -top-0.5 -left-0.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
        style={{
          color,
          fill: color,
          transform: `rotate(${rot}deg)`,
          transformOrigin: "top left",
        }}
        size={24}
        strokeWidth={1}
      />
      <div
        className={`absolute top-4.5 left-4.5 flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 whitespace-nowrap ${PILL}`}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-100 dark:bg-white/10">
          <Icon className="size-3.5 text-neutral-600 dark:text-neutral-300" />
        </span>
        <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
          {label}
        </span>
      </div>
    </div>
  );
}

const AgentCursors = () => {
  return (
    <FitScale width={W} height={H}>
      <div className="relative h-full w-full">
        <CodeRain />

        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[linear-gradient(to_bottom,var(--color-white),transparent)] dark:bg-[linear-gradient(to_bottom,var(--color-black),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-[linear-gradient(to_right,var(--color-white),transparent)] dark:bg-[linear-gradient(to_right,var(--color-black),transparent)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-[linear-gradient(to_left,var(--color-white),transparent)] dark:bg-[linear-gradient(to_left,var(--color-black),transparent)]" />

        {TAGS.map((t) => (
          <AgentTag key={t.label} {...t} />
        ))}
      </div>
    </FitScale>
  );
};

export default AgentCursors;
