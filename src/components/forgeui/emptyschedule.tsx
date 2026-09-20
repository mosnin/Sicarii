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

const EmptySchedule = () => {
  return (
    <FitScale width={460} height={300}>
      <div className="relative h-full w-full overflow-hidden">
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6">
          <div className="relative h-48 w-92">
            <ScheduleRow className="absolute top-0 left-28" />
            <ScheduleRow className="absolute top-16 left-2" />
            <ScheduleRow className="absolute top-32 left-28" />
          </div>

          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
              Nothing scheduled
            </p>
            <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
              Your week ahead is clear
            </p>
          </div>
        </div>
      </div>
    </FitScale>
  );
};

export default EmptySchedule;

const CARD =
  "bg-linear-to-b from-neutral-50 to-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.09),inset_0_2.5px_0_0_rgba(255,255,255,1)] dark:from-[#202020] dark:to-[#151515] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),inset_0_0_0_1px_rgba(255,255,255,0.05),0_28px_56px_-26px_rgba(0,0,0,0.85)]";

const ScheduleRow = ({ className = "" }: { className?: string }) => {
  return (
    <div
      className={cn(
        "flex h-14 w-60 items-center gap-3.5 rounded-lg px-4",
        CARD,
        className,
      )}
    >
      <div className="size-9 shrink-0 rounded-md bg-linear-to-br from-neutral-100 to-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_0_0_1px_rgba(0,0,0,0.04)] dark:from-neutral-700 dark:to-neutral-800 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
      <div className="flex flex-col gap-2">
        <div className="h-2 w-28 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        <div className="h-1.5 w-16 rounded-full bg-neutral-200 dark:bg-neutral-700" />
      </div>
    </div>
  );
};
