"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LuMousePointer2 } from "react-icons/lu";

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

const kw = "text-[#ab5959] dark:text-[#cb7676]";
const fn = "text-[#59873a] dark:text-[#80a665]";
const st = "text-[#b56959] dark:text-[#c98a7d]";
const pl = "text-[#393a34] dark:text-[#dbd7ca]";
const pr = "text-[#998418] dark:text-[#b8a965]";
const nu = "text-[#2f798a] dark:text-[#4d9375]";
const pu = "text-[#a3a3a3] dark:text-[#6f6f6f]";

function Ln({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="w-7 shrink-0 pr-3 text-right text-[#b3b3b3] select-none dark:text-[#4a4a4a]">
        {n}
      </span>
      <span className="whitespace-pre">{children}</span>
    </div>
  );
}

type Cursor = {
  x: number;
  y: number;
  rot: number;
  arrow: string;
  bg: string;
  fg: string;
  name: string;
};

const CURSORS: Cursor[] = [
  {
    x: 295,
    y: 140,
    rot: 6,
    arrow: "#ef4444",
    bg: "#fecaca",
    fg: "#991b1b",
    name: "Ana",
  },
  {
    x: 142,
    y: 326,
    rot: -8,
    arrow: "#f59e0b",
    bg: "#fde68a",
    fg: "#92400e",
    name: "Leo",
  },
];

function LiveCursor({ x, y, rot, arrow, bg, fg, name }: Cursor) {
  return (
    <div className="absolute z-20" style={{ left: x, top: y }}>
      <LuMousePointer2
        className="absolute -top-0.5 -left-0.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
        style={{
          color: arrow,
          fill: arrow,
          transform: `rotate(${rot}deg)`,
          transformOrigin: "top left",
        }}
        size={24}
        strokeWidth={1}
      />
      <div
        className="absolute top-4 left-4 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold whitespace-nowrap shadow-[0_2px_8px_-2px_rgba(0,0,0,0.35)]"
        style={{ backgroundColor: bg, color: fg }}
      >
        {name}
      </div>
    </div>
  );
}

const CodePresence = () => {
  return (
    <FitScale width={580} height={384}>
      <div className="relative h-full w-full">
        <div
          className="absolute overflow-hidden rounded-2xl bg-neutral-50 shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_28px_56px_-24px_rgba(0,0,0,0.14)] dark:bg-[#131313] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_30px_64px_-24px_rgba(0,0,0,0.9)]"
          style={{ left: 46, top: 70, width: 488 }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(120%_90%_at_0%_0%,rgba(255,255,255,0.05),transparent_55%)] dark:block"
          />

          <div className="relative flex items-center border-b border-black/6 px-4 py-3 dark:border-white/6">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="pointer-events-none absolute inset-x-0 text-center font-mono text-[11.5px] font-medium text-neutral-500 dark:text-neutral-500">
              useCartTotal.ts
            </span>
          </div>

          <div className="relative px-4 pt-3 pb-8 font-mono text-[12px] leading-[1.92] tracking-tight">
            <Ln n={1}>
              <span className={kw}>import</span>
              <span className={pl}> {"{ "}</span>
              <span className={fn}>useMemo</span>
              <span className={pl}>{" }"} </span>
              <span className={kw}>from</span>{" "}
              <span className={st}>&quot;react&quot;</span>
              <span className={pu}>;</span>
            </Ln>
            <Ln n={2}> </Ln>
            <Ln n={3}>
              <span className={kw}>export function</span>{" "}
              <span className={fn}>useCartTotal</span>
              <span className={pu}>(</span>
              <span className={pl}>items</span>
              <span className={pu}>: </span>
              <span className={pr}>Item</span>
              <span className={pu}>[]) {"{"}</span>
            </Ln>
            <Ln n={4}>
              <span className={pl}>{"  "}</span>
              <span className={kw}>const</span> <span className={pl}>sum</span>{" "}
              <span className={pu}>=</span> <span className={fn}>useMemo</span>
              <span className={pu}>{"(() => {"}</span>
            </Ln>
            <Ln n={5}>
              <span className={pl}>{"    "}</span>
              <span className={kw}>return</span>{" "}
              <span className={pl}>items</span>
              <span className={pu}>.</span>
              <span className={fn}>reduce</span>
              <span className={pu}>{"((n, it) => n + it.price, "}</span>
              <span className={nu}>0</span>
              <span className={pu}>);</span>
            </Ln>
            <Ln n={6}>
              <span className={pl}>{"  "}</span>
              <span className={pu}>{"}, ["}</span>
              <span className={pl}>items</span>
              <span className={pu}>]);</span>
            </Ln>
            <Ln n={7}> </Ln>
            <Ln n={8}>
              <span className={pl}>{"  "}</span>
              <span className={kw}>return</span> <span className={kw}>new</span>{" "}
              <span className={pr}>Intl</span>
              <span className={pu}>.</span>
              <span className={fn}>NumberFormat</span>
              <span className={pu}>(</span>
              <span className={st}>&quot;en-US&quot;</span>
              <span className={pu}>, {"{"}</span>
            </Ln>
            <Ln n={9}>
              <span className={pl}>{"    "}</span>
              <span className={pr}>style</span>
              <span className={pu}>: </span>
              <span className={st}>&quot;currency&quot;</span>
              <span className={pu}>,</span>
            </Ln>
            <Ln n={10}>
              <span className={pl}>{"    "}</span>
              <span className={pr}>currency</span>
              <span className={pu}>: </span>
              <span className={st}>&quot;USD&quot;</span>
              <span className={pu}>,</span>
            </Ln>
            <Ln n={11}>
              <span className={pl}>{"  "}</span>
              <span className={pu}>{"})."}</span>
              <span className={fn}>format</span>
              <span className={pu}>(</span>
              <span className={pl}>sum</span>
              <span className={pu}>);</span>
            </Ln>
            <Ln n={12}>
              <span className={pu}>{"}"}</span>
            </Ln>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]"
        />

        {CURSORS.map((c) => (
          <LiveCursor key={c.name} {...c} />
        ))}
      </div>
    </FitScale>
  );
};

export default CodePresence;
