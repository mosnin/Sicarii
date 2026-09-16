"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
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

const ExportFlow = () => {
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationKey((prev) => prev + 1);
    }, 3200);

    return () => clearInterval(interval);
  });

  return (
    <FitScale width={300} height={300}>
      <ExportFlowScene key={animationKey} />
    </FitScale>
  );
};

export default ExportFlow;

const ExportFlowScene = () => {
  return (
    <div className="relative h-75 w-full max-w-75 min-w-75 overflow-hidden">
      <div className="absolute bottom-15 left-0 h-[50%] w-full">
        <AnimatedBelowPaths />
      </div>
      <div className="absolute top-0 left-0 h-[50%] w-full">
        <AnimatedTopPaths />
      </div>
      <div className="absolute bottom-4 left-0 flex h-[20%] w-full items-center justify-between">
        <DocumentIcon className="size-14" />
        <DocumentIcon className="size-14" />
        <DocumentIcon className="size-14" />
        <DocumentIcon className="size-14" />
        <DocumentIcon className="size-14" />
      </div>
      <motion.div
        animate={{
          boxShadow: [
            "0 0 7px 1px rgba(104, 211, 145, 0)",
            "0 0 7px 1px rgba(104, 211, 145, 1)",
            "0 0 7px 1px rgba(104, 211, 145, 1)",
            "0 0 7px 1px rgba(104, 211, 145, 0)",
          ],
        }}
        transition={{
          duration: 2.5,
          delay: 0.5,
          ease: "easeInOut",
        }}
        className={cn(
          "absolute top-1/2",
          "left-23.75 -mt-8.75 flex items-center justify-center rounded-md px-[12.5px] py-[6.5px]",
          "border border-neutral-300 text-xs text-neutral-900 dark:border-neutral-800 dark:text-neutral-200",
          "bg-linear-to-br from-neutral-200 to-neutral-50 dark:from-neutral-700 dark:to-neutral-950",
        )}
      >
        Export as CSV
      </motion.div>
      <div className="pointer-events-none absolute top-0 left-0 h-24 w-full bg-[linear-gradient(to_bottom,var(--color-white)_50%,transparent_100%)] dark:bg-[linear-gradient(to_bottom,var(--color-black)_50%,transparent_100%)]" />
      <style>{`
      .exportdata {
  offset-anchor: 10px 0px;
  animation: exportdata-animation-path;
  animation-timing-function: cubic-bezier(0.275, 0.72, 0.165, 0.99);
  animation-duration: 4s;
}

.lw-line-1 {
  offset-path: path("M 14.5 98 v -35 q 0 -4 4 -4 h 74 q 4 0 4 -4 v -50");
}
.lw-line-2 {
  offset-path: path("M 55.5 98 v -35 q 0 -4 4 -4 h 33 q 4 0 4 -4 v -50");
}
.lw-line-3 {
  offset-path: path("M 96.5 98 v -85");
}
.lw-line-4 {
  offset-path: path("M 137.5 98 v -35 q 0 -4 -4 -4 h -33 q -4 0 -4 -4 v -50");
}
.lw-line-5 {
  offset-path: path("M 178.5 98 v -35 q 0 -4 -4 -4 h -74 q -4 0 -4 -4 v -50");
}
.tp-line-1 {
  offset-path: path("M 92.5 87 v -90");
  animation-delay: 1.85s;
}
.tp-line-2 {
  offset-path: path("M 96.5 87 v -90");
  animation-delay: 2s;
}
.tp-line-3 {
  offset-path: path("M 100.5 87 v -90");
  animation-delay: 2.15s;
}

@keyframes exportdata-animation-path {
  0% {
    offset-distance: 0%;
  }
  80% {
    offset-distance: 100%;
  }
  100% {
    offset-distance: 100%;
  }
}

      `}</style>
    </div>
  );
};

const AnimatedBelowPaths = () => {
  return (
    <svg
      className="h-full w-full text-neutral-300 dark:text-neutral-800"
      width="100%"
      height="100%"
      viewBox="0 0 200 100"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="0.3">
        <path d="M 14.5 98 v -35 q 0 -4 4 -4 h 74 q 4 0 4 -4 v -25" />
        <path d="M 55.5 98 v -35 q 0 -4 4 -4 h 33 q 4 0 4 -4 v -25" />
        <path d="M 96.5 98 v -68" />
        <path d="M 137.5 98 v -35 q 0 -4 -4 -4 h -33 q -4 0 -4 -4 v -25" />
        <path d="M 178.5 98 v -35 q 0 -4 -4 -4 h -74 q -4 0 -4 -4 v -25" />
      </g>
      <g mask="url(#lw-mask-1)">
        <circle
          className="exportdata lw-line-1"
          cx="0"
          cy="0"
          r="12"
          fill="url(#lw-color-grad)"
        />
      </g>
      <g mask="url(#lw-mask-2)">
        <circle
          className="exportdata lw-line-2"
          cx="0"
          cy="0"
          r="12"
          fill="url(#lw-color-grad)"
        />
      </g>
      <g mask="url(#lw-mask-3)">
        <circle
          className="exportdata lw-line-3"
          cx="0"
          cy="0"
          r="12"
          fill="url(#lw-color-grad)"
        />
      </g>
      <g mask="url(#lw-mask-4)">
        <circle
          className="exportdata lw-line-4"
          cx="0"
          cy="0"
          r="12"
          fill="url(#lw-color-grad)"
        />
      </g>
      <g mask="url(#lw-mask-5)">
        <circle
          className="exportdata lw-line-5"
          cx="0"
          cy="0"
          r="12"
          fill="url(#lw-color-grad)"
        />
      </g>

      <defs>
        <mask id="lw-mask-1">
          <path
            d="M 14.5 98 v -35 q 0 -4 4 -4 h 74 q 4 0 4 -4 v -25"
            strokeWidth="0.4"
            stroke="white"
          />
        </mask>
        <mask id="lw-mask-2">
          <path
            d="M 55.5 98 v -35 q 0 -4 4 -4 h 33 q 4 0 4 -4 v -25"
            strokeWidth="0.4"
            stroke="white"
          />
        </mask>
        <mask id="lw-mask-3">
          <path d="M 96.5 98 v -68" strokeWidth="0.4" stroke="white" />
        </mask>
        <mask id="lw-mask-4">
          <path
            d="M 137.5 98 v -35 q 0 -4 -4 -4 h -33 q -4 0 -4 -4 v -25"
            strokeWidth="0.4"
            stroke="white"
          />
        </mask>
        <mask id="lw-mask-5">
          <path
            d="M 178.5 98 v -35 q 0 -4 -4 -4 h -74 q -4 0 -4 -4 v -25"
            strokeWidth="0.4"
            stroke="white"
          />
        </mask>
        <radialGradient id="lw-color-grad" fx="1">
          <stop offset="0%" stopColor={"#22c55e"} />
          <stop offset="30%" stopColor={"#22c55e"} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
    </svg>
  );
};

const AnimatedTopPaths = () => {
  return (
    <svg
      className="h-full w-full text-neutral-300 dark:text-neutral-800"
      width="100%"
      height="100%"
      viewBox="0 0 200 100"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="0.3">
        <path d="M 92.5 87 v -70" />
        <path d="M 96.5 87 v -70" />
        <path d="M 100.5 87 v -70" />
      </g>
      <g mask="url(#tp-mask-1)">
        <circle
          className="exportdata tp-line-1"
          cx="0"
          cy="0"
          r="12"
          fill="url(#top-color-grad)"
        />
      </g>
      <g mask="url(#tp-mask-2)">
        <circle
          className="exportdata tp-line-2"
          cx="0"
          cy="0"
          r="12"
          fill="url(#top-color-grad)"
        />
      </g>
      <g mask="url(#tp-mask-3)">
        <circle
          className="exportdata tp-line-3"
          cx="0"
          cy="0"
          r="12"
          fill="url(#top-color-grad)"
        />
      </g>

      <defs>
        <mask id="tp-mask-1">
          <path d="M 92.5 87 v -70" strokeWidth="0.4" stroke="white" />
        </mask>
        <mask id="tp-mask-2">
          <path d="M 96.5 87 v -70" strokeWidth="0.4" stroke="white" />
        </mask>
        <mask id="tp-mask-3">
          <path d="M 100.5 87 v -70" strokeWidth="0.4" stroke="white" />
        </mask>
        <radialGradient id="top-color-grad" fx="1">
          <stop offset="0%" stopColor={"#22c55e"} />
          <stop offset="30%" stopColor={"#22c55e"} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
    </svg>
  );
};

const DocumentIcon = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    xmlSpace="preserve"
    fill="currentColor"
    className={className}
  >
    <path
      fill="currentColor"
      stroke="currentColor"
      className="stroke-neutral-200 stroke-20 text-neutral-50 dark:stroke-black dark:text-[#101010]"
      d="M410 472H72V10h258l80 80z"
    />
    <path
      fill="currentColor"
      className="text-neutral-300 dark:text-[#202020]"
      d="M104 400h274v40H104zM104 360h180v20H104zM104 320h180v20H104z M327 20 v80h80z"
    />
  </svg>
);
