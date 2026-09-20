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

const CARD =
  "bg-linear-to-b from-neutral-100/60 to-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12),inset_0_2.5px_0_0_rgba(255,255,255,1)] dark:from-[#1c1c1c] dark:to-[#141414] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.06),0_18px_40px_-24px_rgba(0,0,0,0.85)]";

const FIELDS: { k: string; v: string; green?: boolean }[] = [
  { k: "id", v: '"9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"' },
  { k: "username", v: '"noah.bennett"' },
  { k: "email", v: '"noah@example.com"' },
  { k: "plan", v: '"pro"', green: true },
  { k: "role", v: '"editor"' },
  { k: "verified", v: "true", green: true },
];

const ApiRequest = () => {
  return (
    <FitScale width={540} height={352}>
      <div className="relative h-full w-full">
        <div className="mx-auto w-115 pt-9">
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 ${CARD}`}
          >
            <span className="flex-1 truncate font-mono text-[13px] text-neutral-400 dark:text-neutral-500">
              api.example.dev
              <span className="text-neutral-900 dark:text-neutral-100">
                /v1/customers
              </span>
            </span>
            <span className="rounded-md bg-linear-to-b from-emerald-500 to-emerald-600 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_0_0_1px_rgba(255,255,255,0.14),0_2px_6px_-3px_rgba(5,150,105,0.25)]">
              POST
            </span>
          </div>

          <div className={`mt-6 overflow-hidden rounded-t-xl ${CARD}`}>
            <div className="flex items-center gap-3 border-b border-neutral-200/70 px-5 py-3 dark:border-white/8">
              <span className="font-mono text-[12px] text-neutral-400 dark:text-neutral-500">
                content-type: application/json
              </span>
              <span className="ml-auto font-mono text-[12px] text-neutral-300 tabular-nums dark:text-neutral-600">
                142&nbsp;ms
              </span>
            </div>

            <div className="space-y-2.5 px-5 py-4 font-mono text-[13px] leading-relaxed">
              {FIELDS.map((f) => (
                <div key={f.k} className="flex gap-2">
                  <span className="text-neutral-700 dark:text-neutral-300">
                    &quot;{f.k}&quot;
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">
                    :
                  </span>
                  <span
                    className={
                      f.green
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-neutral-500 dark:text-neutral-400"
                    }
                  >
                    {f.v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]" />
      </div>
    </FitScale>
  );
};

export default ApiRequest;
