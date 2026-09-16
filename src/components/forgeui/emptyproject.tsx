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

const EmptyProject = () => {
  return (
    <FitScale width={460} height={300}>
      <div className="relative h-full w-full overflow-hidden">
        <div className="flex h-full w-full flex-col items-center justify-center gap-7 px-6">
          <div className="relative h-40 w-96">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 dark:bg-[radial-gradient(60%_60%_at_50%_42%,rgba(255,255,255,0.05),transparent_70%)]"
            />
            <ProjectCard
              variant="back"
              className="absolute top-1 left-9 -rotate-10"
            />
            <ProjectCard
              variant="mid"
              className="absolute top-2 left-27 rotate-10"
            />
            <ProjectCard
              variant="front"
              className="absolute top-8 left-18 z-10 -rotate-2"
            />
          </div>

          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
              Your library is empty
            </p>
            <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
              Anything you save will show up here
            </p>
          </div>
        </div>
      </div>
    </FitScale>
  );
};

export default EmptyProject;

const SURFACE = {
  front:
    "bg-linear-to-b from-neutral-50 to-neutral-100 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12),inset_0_2px_0_0_rgba(255,255,255,1),0_6px_14px_-8px_rgba(0,0,0,0.14)] dark:from-[#202020] dark:to-[#151515] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),inset_0_0_0_1px_rgba(255,255,255,0.05),0_28px_56px_-26px_rgba(0,0,0,0.85)]",
  mid: "bg-linear-to-b from-neutral-50 to-neutral-100 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12),inset_0_2px_0_0_rgba(255,255,255,1)] dark:from-[#181818] dark:to-[#121212] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_0_0_1px_rgba(255,255,255,0.04),0_18px_36px_-24px_rgba(0,0,0,0.7)]",
  back: "bg-linear-to-b from-neutral-100 to-neutral-200 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12),inset_0_2px_0_0_rgba(255,255,255,1)] dark:from-[#141414] dark:to-[#0f0f0f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),inset_0_0_0_1px_rgba(255,255,255,0.03),0_12px_28px_-22px_rgba(0,0,0,0.6)]",
};

type Variant = keyof typeof SURFACE;

const ProjectCard = ({
  variant,
  className = "",
}: {
  variant: Variant;
  className?: string;
}) => {
  const front = variant === "front";
  return (
    <div
      className={cn("h-24 w-60 rounded-2xl p-3.5", SURFACE[variant], className)}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "size-9 shrink-0 rounded-lg",
            front
              ? "bg-linear-to-br from-neutral-300 to-neutral-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_10px_-4px_rgba(0,0,0,0.22)] dark:from-neutral-400 dark:to-neutral-600 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_10px_-4px_rgba(0,0,0,0.4)]"
              : "bg-linear-to-br from-neutral-200 to-neutral-400 dark:from-neutral-700 dark:to-neutral-800",
          )}
        />
        <div className="flex flex-1 flex-col gap-1.5">
          <div
            className={cn(
              "h-2 rounded-full",
              front
                ? "w-24 bg-neutral-300 dark:bg-neutral-600"
                : "w-20 bg-neutral-300/80 dark:bg-neutral-800",
            )}
          />
          <div
            className={cn(
              "h-1.5 rounded-full",
              front
                ? "w-16 bg-neutral-200 dark:bg-neutral-700"
                : "w-12 bg-neutral-300/60 dark:bg-neutral-800/70",
            )}
          />
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5">
        <div
          className={cn(
            "h-1.5 w-full rounded-full",
            front
              ? "bg-neutral-200 dark:bg-neutral-800"
              : "bg-neutral-300/50 dark:bg-neutral-800/50",
          )}
        />
        <div
          className={cn(
            "h-1.5 rounded-full",
            front
              ? "w-2/3 bg-neutral-200 dark:bg-neutral-800"
              : "w-1/2 bg-neutral-300/50 dark:bg-neutral-800/50",
          )}
        />
      </div>
    </div>
  );
};
