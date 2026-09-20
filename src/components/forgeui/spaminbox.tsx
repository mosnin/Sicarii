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

const LINE =
  "M0,132 C5.3,131.3 31.5,126.5 42,126 C52.5,125.5 73.5,129.3 84,128 C94.5,126.8 115.5,118.5 126,116 C136.5,113.5 157.5,108.8 168,108 C178.5,107.3 199.5,112.3 210,110 C220.5,107.8 241.5,94 252,90 C262.5,86 283.5,79.1 294,78 C304.5,76.9 325.5,83 336,81 C346.5,79 367.5,65.6 378,62 C388.5,58.4 409.5,52.9 420,52 C430.5,51.1 451.5,56.8 462,55 C472.5,53.3 498.8,40.1 504,38";
const AREA = `${LINE} L504,260 L0,260 Z`;

const SpamInbox = () => {
  return (
    <FitScale width={460} height={300}>
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute" style={{ left: 96, top: 58 }}>
          <div
            className="absolute rounded-3xl bg-neutral-100 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.22)] ring-1 ring-neutral-200 dark:bg-[#0f0f0f] dark:ring-[#242424]"
            style={{ left: -48, top: 30, width: 490, height: 300 }}
          />

          <div
            className="relative rounded-3xl bg-neutral-100 p-2 shadow-[0_26px_64px_-26px_rgba(0,0,0,0.28)] ring-1 ring-neutral-200 dark:bg-[#0f0f0f] dark:shadow-[0_30px_70px_-26px_rgba(0,0,0,0.8)] dark:ring-[#242424]"
            style={{ width: 520 }}
          >
            <div
              className="overflow-hidden rounded-[18px] bg-white ring-1 ring-neutral-200 dark:bg-neutral-950 dark:ring-[#242424]"
              style={{ height: 308 }}
            >
              <div className="flex h-12 items-center border-b border-neutral-200/70 px-5 dark:border-white/10">
                <div className="flex gap-2">
                  <span className="size-2.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                  <span className="size-2.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                  <span className="size-2.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                </div>
              </div>

              <div className="relative" style={{ height: 260 }}>
                <svg
                  viewBox="0 0 504 260"
                  fill="none"
                  preserveAspectRatio="none"
                  className="h-full w-full text-emerald-500 dark:text-emerald-400"
                >
                  <defs>
                    <linearGradient id="sbArea" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.16"
                      />
                      <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>

                  <path d={AREA} fill="url(#sbArea)" />
                  <path
                    d={LINE}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                <div className="absolute top-2 left-3 flex items-baseline gap-2">
                  <p className="text-lg font-medium tracking-tight text-neutral-700 tabular-nums dark:text-neutral-300">
                    $12,480
                  </p>
                  <span className="text-[12px] font-medium text-emerald-500/80 dark:text-emerald-400/80">
                    +4.2%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-linear-to-l from-white to-transparent dark:from-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-linear-to-t from-white to-transparent dark:from-black"
        />
      </div>
    </FitScale>
  );
};

export default SpamInbox;
