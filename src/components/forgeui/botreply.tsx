"use client";

import Image from "next/image";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaDiscord } from "react-icons/fa6";
import { SiNotion } from "react-icons/si";

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

const mention =
  "rounded px-1 font-medium text-[#3d55d7] bg-[#5865f2]/12 dark:text-[#c9cdfb] dark:bg-[#5865f2]/28";

const cite = "text-[#3d55d7] dark:text-[#a3aafb]";

const BotReply = () => {
  return (
    <FitScale width={620} height={400}>
      <div className="relative h-full w-full">
        <div
          className="absolute overflow-hidden rounded-2xl shadow-[0_30px_50px_-30px_rgba(0,0,0,0.1)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_2px_4px_rgba(0,0,0,0.5),0_28px_62px_-26px_rgba(0,0,0,0.85)]"
          style={{ left: 48, top: 20, width: 700, height: 440 }}
        >
          <div className="flex h-full">
            <aside className="flex w-17 shrink-0 flex-col items-center gap-2 bg-[#efeff1] pt-3.5 dark:bg-[#0e0e0f]">
              <div className="grid size-11 place-items-center rounded-xl bg-[#5865f2]">
                <FaDiscord className="size-6 text-white" />
              </div>
              <span className="my-0.5 h-0.5 w-8 rounded-full bg-black/10 dark:bg-white/10" />
              <span className="size-11 rounded-xl bg-black/4 ring-1 ring-black/5 dark:bg-white/4 dark:ring-white/6" />
              <span className="size-11 rounded-xl bg-black/4 ring-1 ring-black/5 dark:bg-white/4 dark:ring-white/6" />
            </aside>

            <main className="min-w-0 flex-1 bg-[#fbfbfc] pt-5 pr-6 pl-4 dark:bg-[#161617]">
              <div className="flex flex-col gap-5">
                <div className="flex gap-3">
                  <Image
                    src="/pfp2.jpg"
                    alt="Marcus"
                    width={80}
                    height={80}
                    className="size-10 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-semibold text-[#111214] dark:text-white">
                        Marcus
                      </span>
                      <span className="text-[11px] text-neutral-500 dark:text-[#949ba4]">
                        9:16 AM
                      </span>
                    </div>
                    <p className="mt-0.5 text-[15.5px] whitespace-nowrap text-[#2e3338] dark:text-[#dbdee1]">
                      <span className={mention}>@Notion</span> what are people
                      saying about the new onboarding flow?
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]">
                    <SiNotion className="size-6 text-black" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-[#111214] dark:text-white">
                        Notion
                      </span>
                      <span className="text-[11px] text-neutral-500 dark:text-[#949ba4]">
                        9:16 AM
                      </span>
                    </div>
                    <p className="mt-0.5 text-[15.5px] whitespace-nowrap text-[#2e3338] dark:text-[#dbdee1]">
                      Here&apos;s what came up most often about the new
                      onboarding flow —
                    </p>
                    <ul className="mt-2 space-y-2 text-[15.5px] whitespace-nowrap text-[#2e3338] dark:text-[#dbdee1]">
                      <li className="flex gap-2">
                        <span className="text-neutral-400 dark:text-[#6d7178]">
                          •
                        </span>
                        <span>
                          A lot of people got stuck on the workspace setup step{" "}
                          <span className={cite}>[1][2][3]</span>
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-neutral-400 dark:text-[#6d7178]">
                          •
                        </span>
                        <span>
                          Several said the field labels felt confusing{" "}
                          <span className={cite}>[4][5]</span>
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-neutral-400 dark:text-[#6d7178]">
                          •
                        </span>
                        <span>
                          A few asked to skip the sample-data step entirely{" "}
                          <span className={cite}>[6]</span>
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-neutral-400 dark:text-[#6d7178]">
                          •
                        </span>
                        <span>
                          Many wanted a progress indicator while importing{" "}
                          <span className={cite}>[7][8]</span>
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </main>
          </div>

          <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),inset_0_2px_0_0_rgba(255,255,255,1)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_1px_0_0_rgba(255,255,255,0.045),inset_0_0_0_1px_rgba(255,255,255,0.035)]" />
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-44 bg-[linear-gradient(to_left,var(--color-white),transparent)] dark:bg-[linear-gradient(to_left,var(--color-black),transparent)]" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]" />
      </div>
    </FitScale>
  );
};

export default BotReply;
