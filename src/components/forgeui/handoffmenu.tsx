"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BsOpenai } from "react-icons/bs";
import {
  SiClaude,
  SiCursor,
  SiOpencode,
  SiZedindustries,
} from "react-icons/si";

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

type Tool = {
  label: string;
  Icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  color?: string;
};

const TOOLS: Tool[] = [
  { label: "Run in Opencode", Icon: SiOpencode },
  { label: "Open in Cursor", Icon: SiCursor },
  { label: "Build in Claude", Icon: SiClaude, color: "#d97757" },
  { label: "Continue in Codex", Icon: BsOpenai },
  { label: "Open in Zed", Icon: SiZedindustries },
];

const HandoffMenu = () => {
  return (
    <FitScale width={380} height={290}>
      <div className="relative h-full w-full">
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2.5">
          {TOOLS.map((t) => (
            <div
              key={t.label}
              className="flex h-11 w-75 items-center gap-3 rounded-xl bg-black/3 px-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] dark:bg-white/5 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
            >
              <t.Icon
                className="size-5 shrink-0 text-neutral-800 dark:text-neutral-100"
                style={t.color ? { color: t.color } : undefined}
              />
              <span className="text-[14px] text-neutral-700 dark:text-neutral-200">
                {t.label}
              </span>
            </div>
          ))}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-[linear-gradient(to_bottom,var(--color-white),transparent)] dark:bg-[linear-gradient(to_bottom,var(--color-black),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]"
        />
      </div>
    </FitScale>
  );
};

export default HandoffMenu;
