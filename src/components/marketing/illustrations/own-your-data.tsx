"use client";

/**
 * Data you own, adapted from Forge UI `export-flow`.
 *
 * Recoloured off its green pulse onto the one brand accent, re-tokenised off
 * `neutral-*`, and labelled with the record types Scalar actually stores - so
 * the picture argues the page's hardest claim (a single source of truth you
 * can take with you) instead of showing five anonymous files. Its interval had
 * no dependency array and re-armed on every render; it is armed once here.
 */

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import React, { useEffect, useState } from "react";

import { FitScale } from "./fit-scale";

const RECORD_TYPES = ["Companies", "Contacts", "Deals", "Notes", "Signals"];

export function OwnYourData() {
  const reduce = useReducedMotion();
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setAnimationKey((prev) => prev + 1);
    }, 3200);

    return () => clearInterval(interval);
  }, [reduce]);

  return (
    <FitScale width={300} height={300}>
      <ExportFlowScene key={animationKey} />
    </FitScale>
  );
};


const ExportFlowScene = () => {
  return (
    <div className="relative h-75 w-full max-w-75 min-w-75 overflow-hidden">
      <div className="absolute bottom-15 left-0 h-[50%] w-full">
        <AnimatedBelowPaths />
      </div>
      <div className="absolute top-0 left-0 h-[50%] w-full">
        <AnimatedTopPaths />
      </div>
      <div className="absolute bottom-4 left-0 flex h-[20%] w-full items-start justify-between px-1">
        {RECORD_TYPES.map((label) => (
          <div key={label} className="flex w-12 shrink-0 flex-col items-center gap-1">
            <DocumentIcon className="size-11" />
            <span className="text-[8px] leading-none whitespace-nowrap text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <motion.div
        animate={{
          boxShadow: [
            "0 0 7px 1px rgba(90, 176, 232, 0)",
            "0 0 7px 1px rgba(90, 176, 232, 1)",
            "0 0 7px 1px rgba(90, 176, 232, 1)",
            "0 0 7px 1px rgba(90, 176, 232, 0)",
          ],
        }}
        transition={{
          duration: 2.5,
          delay: 0.5,
          ease: "easeInOut",
        }}
        className={cn(
          "absolute top-1/2",
          "left-1/2 -translate-x-1/2 -mt-8.75 flex items-center justify-center rounded-md px-[12.5px] py-[6.5px]",
          "border border-border text-xs text-foreground",
          "bg-card",
        )}
      >
        Export as CSV
      </motion.div>
      <style>{`
      @media (prefers-reduced-motion: reduce) {
        .exportdata { animation: none !important; opacity: 0; }
      }
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
      className="h-full w-full text-border"
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
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="30%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
    </svg>
  );
};

const AnimatedTopPaths = () => {
  return (
    <svg
      className="h-full w-full text-border"
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
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="30%" stopColor="var(--primary)" />
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
      className="stroke-border stroke-20 text-muted"
      d="M410 472H72V10h258l80 80z"
    />
    <path
      fill="currentColor"
      className="text-muted-foreground/25"
      d="M104 400h274v40H104zM104 360h180v20H104zM104 320h180v20H104z M327 20 v80h80z"
    />
  </svg>
);
