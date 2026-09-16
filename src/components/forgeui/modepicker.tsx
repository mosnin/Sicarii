"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BsCursorFill, BsSendFill } from "react-icons/bs";
import {
  LuPlus,
  LuRefreshCw,
  LuTelescope,
  LuThumbsDown,
  LuThumbsUp,
  LuZap,
} from "react-icons/lu";

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

type Mode = {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  active?: boolean;
};

const MODES: Mode[] = [
  {
    Icon: LuZap,
    title: "Instant",
    desc: "Best for most questions",
    active: true,
  },
  {
    Icon: LuTelescope,
    title: "Thorough",
    desc: "Reasons through it step by step",
  },
];

const ModePicker = () => {
  return (
    <FitScale width={500} height={380}>
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-x-0 top-0 px-9 pt-8">
          <p className="text-[13px] text-neutral-300 dark:text-neutral-700">
            Draft ready
          </p>
          <p className="mt-4 max-w-96 text-[14px] leading-relaxed text-neutral-400 dark:text-neutral-600">
            Here&apos;s a first pass — want it kept tight, or expanded with a
            couple of examples?
          </p>
          <div className="mt-4 flex items-center gap-5 text-neutral-300 dark:text-neutral-700">
            <LuThumbsUp className="size-4" />
            <LuThumbsDown className="size-4" />
            <LuRefreshCw className="size-4" />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-linear-to-b from-white to-transparent dark:from-black" />

        <div className="absolute inset-x-6 bottom-5 z-10 rounded-xl bg-linear-to-b from-white to-neutral-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_0_0_1px_rgba(0,0,0,0.07),0_4px_12px_-12px_rgba(0,0,0,0.09)] dark:from-[#1c1c1c] dark:to-[#161616] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.07),0_12px_30px_-20px_rgba(0,0,0,0.7)]">
          <div className="px-5 pt-4 pb-1 text-[14px] text-neutral-700 dark:text-neutral-200">
            Make my opening paragraph sound more confident
            <span className="cm-cursor ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-neutral-500 dark:bg-neutral-300" />
          </div>

          <div className="flex items-center gap-2 px-3 pt-2 pb-3">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400"
            >
              <LuPlus className="size-4.5" />
            </button>

            <span className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[13px] font-medium text-neutral-700 dark:bg-white/8 dark:text-neutral-200">
              <LuZap className="size-4" />
              Instant
            </span>

            <button
              type="button"
              aria-label="Send"
              className="ml-auto flex size-9 items-center justify-center rounded-xl bg-linear-to-b from-neutral-700 to-neutral-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_5px_-1px_rgba(0,0,0,0.35)] dark:from-white dark:to-neutral-200 dark:text-neutral-900 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_6px_-1px_rgba(0,0,0,0.5)]"
            >
              <BsSendFill className="size-3.5 translate-x-px" />
            </button>
          </div>
        </div>

        <div
          className="absolute z-20 rounded-xl bg-white/72 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),inset_0_0_0_1px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.08),0_12px_28px_-16px_rgba(0,0,0,0.14)] backdrop-blur-xl [-webkit-backdrop-filter:blur(24px)] dark:bg-[#242424]/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.12),0_2px_6px_-2px_rgba(0,0,0,0.45),0_20px_44px_-18px_rgba(0,0,0,0.85)]"
          style={{ left: 40, bottom: 78, width: 272 }}
        >
          {MODES.map((m) => (
            <div
              key={m.title}
              className={`relative flex items-start gap-3 rounded-lg px-3 py-2.5 ${
                m.active
                  ? "bg-black/4.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] dark:bg-white/[0.07] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)]"
                  : ""
              }`}
            >
              <m.Icon className="mt-0.5 size-4.5 shrink-0 text-neutral-700 dark:text-neutral-200" />
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-neutral-900 dark:text-neutral-100">
                  {m.title}
                </p>
                <p className="mt-0.5 text-[11.5px] text-neutral-500 dark:text-neutral-500">
                  {m.desc}
                </p>
              </div>
              {m.active && (
                <span className="absolute top-1/2 right-4 -translate-y-1/2">
                  <BsCursorFill
                    className="size-4 text-neutral-700 drop-shadow-sm dark:text-neutral-100"
                    style={{ transform: "scaleX(-1)" }}
                  />
                </span>
              )}
            </div>
          ))}
        </div>

        <style>{`@keyframes cm-blink{0%,49%{opacity:1}50%,100%{opacity:0}}.cm-cursor{animation:cm-blink 1.1s step-end infinite}`}</style>
      </div>
    </FitScale>
  );
};

export default ModePicker;
