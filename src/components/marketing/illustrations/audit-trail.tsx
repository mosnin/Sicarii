"use client";

import { cn } from "@/lib/utils";
import React from "react";

import { FitScale } from "./fit-scale";

const CARD =
  "border border-border bg-card shadow-sm";

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
    title: "Company added",
    range: "May 4 · agent · Exa",
    left: 44,
    width: 258,
    top: 90,
    avatars: 3,
  },
  {
    title: "Email verified",
    range: "May 19 · agent · Pipe0",
    left: 188,
    width: 250,
    top: 150,
    avatars: 1,
  },
  {
    title: "Funding enriched",
    range: "May 8 · agent · Explorium",
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
          className="size-6 rounded-full bg-primary/15 ring-2 ring-card"
          style={{ zIndex: count - i }}
        />
      ))}
    </div>
  );
}

export function AuditTrail() {
  const playX = PLAYHEAD_X;

  return (
    <FitScale width={520} height={300}>
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="absolute h-px bg-border"
          style={{ left: RULER_LEFT, right: 520 - RULER_RIGHT, top: 60 }}
        />

        {Array.from({ length: TICK_COUNT + 1 }).map((_, i) => {
          const major = i % 7 === 0 || i === 23;
          return (
            <div
              key={i}
              className="absolute w-px bg-border"
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
            className="absolute -translate-x-1/2 text-[9px] font-medium tracking-wide text-muted-foreground tabular-nums"
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
              <p className="truncate text-[13px] tracking-tight text-foreground">
                {r.title}
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                {r.range}
              </p>
            </div>

            <Avatars count={r.avatars} />
          </div>
        ))}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 w-12 -translate-x-1/2 bg-primary/10 blur-2xl"
          style={{ left: playX, top: 34, bottom: 0 }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-30 w-px bg-primary/70"
          style={{ left: playX, top: 28, bottom: 0 }}
        />

        <div
          className="absolute z-40 -translate-x-1/2 rounded-md bg-primary px-2.5 py-1 text-[10px] font-medium tracking-wide text-primary-foreground shadow-sm"
          style={{ left: playX, top: 6 }}
        >
          TODAY
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-50 w-10 bg-linear-to-r from-[var(--card)] to-transparent dark:from-[var(--card)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-50 w-8 bg-linear-to-l from-[var(--card)] to-transparent dark:from-[var(--card)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-50 h-10 bg-linear-to-t from-[var(--card)] to-transparent dark:from-[var(--card)]"
        />
      </div>
    </FitScale>
  );
};

