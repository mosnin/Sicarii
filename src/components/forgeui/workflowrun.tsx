"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  GoBeaker,
  GoCheck,
  GoCodescan,
  GoContainer,
  GoGitCommit,
  GoGraph,
  GoPackage,
  GoRocket,
} from "react-icons/go";

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
      style={{
        height: (scale || 1) * height,
        visibility: scale ? "visible" : "hidden",
      }}
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

const PILL =
  "inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 bg-linear-to-b from-neutral-100 to-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12),inset_0_2px_0_0_rgba(255,255,255,1)] dark:from-[#1c1c1c] dark:to-[#141414] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.06),0_24px_48px_-26px_rgba(0,0,0,0.85)]";

const NAME = "text-[13px] font-medium text-neutral-900 dark:text-neutral-100";
const META = "text-[13px] text-neutral-500 dark:text-neutral-400";
const GLYPH = "size-4 text-neutral-800 dark:text-neutral-200";
const MONO = "font-mono text-[12px] text-neutral-500 dark:text-neutral-400";
const RIGHT_GLYPH = "size-4 text-neutral-400 dark:text-neutral-500";

const JOB_W = 110;
const FOLLOW_W = 110;

function Spinner() {
  return (
    <span className="relative inline-block size-4 text-neutral-400 dark:text-neutral-500">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className="wf-spin absolute top-1/2 left-1/2 w-1 rounded-full bg-current"
          style={{
            height: 1.5,
            transform: `translate(-50%, -50%) rotate(${i * 36}deg) translate(146%)`,
            animationDelay: `${-900 + i * 100}ms`,
          }}
        />
      ))}
    </span>
  );
}

const WorkflowRun = () => {
  return (
    <FitScale width={400} height={300}>
      <style>{`
        @keyframes wf-spin { 0% { opacity: 1; } 100% { opacity: 0.15; } }
        .wf-spin { animation: wf-spin 1s linear infinite; }
      `}</style>

      <div className="relative h-full w-full">
        <div
          className="absolute"
          style={{ left: 34, top: 20, width: 330, height: 264 }}
        >
          <svg
            aria-hidden="true"
            width={330}
            height={264}
            viewBox="0 0 330 264"
            fill="none"
            className="absolute inset-0 text-neutral-200 dark:text-neutral-800"
          >
            <g
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray="1.5 6"
            >
              <path d="M22 30 V60 Q22 72 34 72 H42" />
              <path d="M56 86 V117 Q56 129 68 129 H82" />
              <path d="M56 86 V175 Q56 187 68 187 H82" />
              <path d="M56 86 V233 Q56 245 68 245 H82" />
              <path d="M190 129 H214" />
              <path d="M190 245 H214" />
            </g>
          </svg>

          <div
            className={cn(PILL, "absolute gap-2")}
            style={{ left: 8, top: 0 }}
          >
            <GoGitCommit className={GLYPH} />
            <span className={NAME}>Commit</span>
            <span className={MONO}>a3f9c21</span>
          </div>

          <div
            className={cn(PILL, "absolute gap-2")}
            style={{ left: 40, top: 56 }}
          >
            <GoPackage className={GLYPH} />
            <span className={NAME}>Install</span>
            <span className={META}>deps</span>
          </div>

          <div
            className={cn(PILL, "absolute justify-between")}
            style={{ left: 80, top: 114, width: JOB_W }}
          >
            <span className="flex items-center gap-2">
              <GoBeaker className={GLYPH} />
              <span className={NAME}>Test</span>
            </span>
            <Spinner />
          </div>
          <div
            className={cn(PILL, "absolute gap-2")}
            style={{ left: 214, top: 114, width: FOLLOW_W }}
          >
            <GoGraph className={GLYPH} />
            <span className={NAME}>Report</span>
          </div>

          <div
            className={cn(PILL, "absolute justify-between")}
            style={{ left: 80, top: 172, width: JOB_W }}
          >
            <span className="flex items-center gap-2">
              <GoCodescan className={GLYPH} />
              <span className={NAME}>Lint</span>
            </span>
            <GoCheck className={RIGHT_GLYPH} />
          </div>

          <div
            className={cn(PILL, "absolute justify-between")}
            style={{ left: 80, top: 230, width: JOB_W }}
          >
            <span className="flex items-center gap-2">
              <GoContainer className={GLYPH} />
              <span className={NAME}>Build</span>
            </span>
            <Spinner />
          </div>
          <div
            className={cn(PILL, "absolute gap-2")}
            style={{ left: 214, top: 230, width: FOLLOW_W }}
          >
            <GoRocket className={GLYPH} />
            <span className={NAME}>Deploy</span>
          </div>
        </div>
      </div>
    </FitScale>
  );
};

export default WorkflowRun;
