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

const BankCard = () => {
  return (
    <FitScale width={420} height={270}>
      <div className="relative flex h-full w-full items-center justify-center">
        <div className="relative h-53.5 w-85 overflow-hidden rounded-[18px] bg-linear-to-br from-neutral-800 via-neutral-950 to-black shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_24px_48px_-20px_rgba(0,0,0,0.15)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_28px_60px_-22px_rgba(0,0,0,0.9)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,rgba(255,255,255,0.07),transparent_55%)]"
          />

          <div className="absolute top-6 left-6 h-9 w-12 overflow-hidden rounded-md bg-linear-to-b from-[#f6d98c] to-[#c69a44] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
            <div className="absolute inset-x-0 top-1/3 h-px -translate-y-1/2 bg-[#9c7327]/80" />
            <div className="absolute inset-x-0 bottom-1/3 h-px -translate-y-1/2 bg-[#9c7327]/80" />
            <div className="absolute inset-y-0 left-1/3 w-px bg-[#9c7327]/70" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-[#9c7327]/70" />
          </div>

          <div className="absolute top-28 left-6 font-mono text-lg tracking-wider text-neutral-300">
            4829 7215 0634 1180
          </div>

          <span className="absolute bottom-6 left-6 font-mono text-[11px] font-medium tracking-[0.2em] text-neutral-400">
            DEBIT
          </span>

          <div className="absolute right-6 bottom-5 flex items-center">
            <div className="size-8 rounded-full bg-[#eb001b]" />
            <div className="-ml-3.5 size-8 rounded-full bg-[#f79e1b]" />
          </div>
        </div>
      </div>
    </FitScale>
  );
};

export default BankCard;
