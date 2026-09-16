"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  SiAirtable,
  SiAsana,
  SiCloudflare,
  SiDatadog,
  SiDiscord,
  SiDropbox,
  SiFramer,
  SiGithub,
  SiGitlab,
  SiLinear,
  SiLoom,
  SiNotion,
  SiObsidian,
  SiPostman,
  SiSpotify,
  SiStripe,
  SiTrello,
  SiTwitch,
  SiVercel,
  SiVimeo,
  SiWebflow,
  SiZapier,
  SiZoom,
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

function FigmaIcon() {
  return (
    <svg width={16} height={24} viewBox="0 0 200 300" aria-hidden="true">
      <path
        fill="#0acf83"
        d="M50 300c27.6 0 50-22.4 50-50v-50H50c-27.6 0-50 22.4-50 50s22.4 50 50 50z"
      />
      <path
        fill="#a259ff"
        d="M0 150c0-27.6 22.4-50 50-50h50v100H50c-27.6 0-50-22.4-50-50z"
      />
      <path
        fill="#f24e1e"
        d="M0 50C0 22.4 22.4 0 50 0h50v100H50C22.4 100 0 77.6 0 50z"
      />
      <path
        fill="#ff7262"
        d="M100 0h50c27.6 0 50 22.4 50 50s-22.4 50-50 50h-50V0z"
      />
      <path
        fill="#1abcfe"
        d="M200 150c0 27.6-22.4 50-50 50s-50-22.4-50-50 22.4-50 50-50 50 22.4 50 50z"
      />
    </svg>
  );
}

type App = {
  Icon?: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  color?: string;
  custom?: React.ReactNode;
};

const APPS: App[] = [
  { Icon: SiLinear, color: "#5e6ad2" },
  { Icon: SiStripe, color: "#635bff" },
  { Icon: SiNotion },
  { custom: <FigmaIcon /> },
  { Icon: SiGitlab, color: "#fc6d26" },
  { Icon: SiDiscord, color: "#5865f2" },
  { Icon: SiSpotify, color: "#1db954" },
  { Icon: SiVercel },
  { Icon: SiFramer, color: "#0099ff" },
  { Icon: SiTwitch, color: "#9146ff" },
  { Icon: SiDropbox, color: "#0061ff" },
  { Icon: SiAirtable, color: "#18bfff" },
  { Icon: SiVimeo, color: "#1ab7ea" },
  { Icon: SiZapier, color: "#ff4f00" },
  { Icon: SiAsana, color: "#f06a6a" },
  { Icon: SiTrello, color: "#0052cc" },
  { Icon: SiLoom, color: "#625df5" },
  { Icon: SiGithub },
  { Icon: SiZoom, color: "#0b5cff" },
  { Icon: SiCloudflare, color: "#f38020" },
  { Icon: SiObsidian, color: "#7c3aed" },
  { Icon: SiDatadog, color: "#632ca6" },
  { Icon: SiWebflow, color: "#146ef5" },
  { Icon: SiPostman, color: "#ff6c37" },
];

const IntegrationWall = () => {
  return (
    <FitScale width={460} height={300}>
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ perspective: "1400px" }}
        >
          <div
            className="grid grid-cols-6 gap-4"
            style={{ transform: "rotateX(36deg) rotateZ(12deg) scale(1.02)" }}
          >
            {APPS.map((a, i) => {
              const Icon = a.Icon;
              return (
                <div
                  key={i}
                  className="flex size-16 items-center justify-center rounded-2xl bg-linear-to-b from-white to-neutral-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_0_0_1px_rgba(0,0,0,0.08),0_18px_22px_-8px_rgba(0,0,0,0.08)] dark:from-[#1e1e1e] dark:to-[#161616] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_0_0_1px_rgba(255,255,255,0.06),0_18px_32px_-10px_rgba(0,0,0,0.75)]"
                >
                  {a.custom
                    ? a.custom
                    : Icon && (
                        <Icon
                          className={`size-7 ${a.color ? "" : "text-neutral-800 dark:text-neutral-100"}`}
                          style={a.color ? { color: a.color } : undefined}
                        />
                      )}
                </div>
              );
            })}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-[linear-gradient(to_bottom,var(--color-white),transparent)] dark:bg-[linear-gradient(to_bottom,var(--color-black),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-[linear-gradient(to_right,var(--color-white),transparent)] dark:bg-[linear-gradient(to_right,var(--color-black),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-[linear-gradient(to_left,var(--color-white),transparent)] dark:bg-[linear-gradient(to_left,var(--color-black),transparent)]"
        />
      </div>
    </FitScale>
  );
};

export default IntegrationWall;
