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

const kw = "text-[#ab5959] dark:text-[#cb7676]";
const fn = "text-[#59873a] dark:text-[#80a665]";
const st = "text-[#b56959] dark:text-[#c98a7d]";
const pl = "text-[#393a34] dark:text-[#dbd7ca]";
const pr = "text-[#998418] dark:text-[#b8a965]";
const nu = "text-[#2f798a] dark:text-[#4d9375]";
const pu = "text-[#a3a3a3] dark:text-[#6f6f6f]";

function Ln({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="w-7 shrink-0 pr-3 text-right text-[#b3b3b3] select-none dark:text-[#4a4a4a]">
        {n}
      </span>
      <span className="whitespace-pre">{children}</span>
    </div>
  );
}

const CodePrompt = () => {
  return (
    <FitScale width={580} height={384}>
      <div className="relative h-full w-full">
        <div
          className="absolute overflow-hidden rounded-tl-[16px] bg-neutral-50 shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_28px_56px_-24px_rgba(0,0,0,0.12)] dark:bg-[#131313] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_30px_64px_-24px_rgba(0,0,0,0.9)]"
          style={{ left: 132, top: 44, width: 520, height: 380 }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(120%_90%_at_0%_0%,rgba(255,255,255,0.05),transparent_55%)] dark:block"
          />

          <div className="relative flex items-center gap-2 px-4 py-3.5">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>

          <div className="relative px-4 pt-1 font-mono text-[11.5px] leading-[1.92] tracking-tight">
            <Ln n={1}>
              <span className={kw}>import</span>
              <span className={pl}> {"{ "}</span>
              <span className={fn}>useMemo</span>
              <span className={pl}>{" }"} </span>
              <span className={kw}>from</span>{" "}
              <span className={st}>&quot;react&quot;</span>
              <span className={pu}>;</span>
            </Ln>
            <Ln n={2}>
              <span className={kw}>import</span>
              <span className={pl}> {"{ "}</span>
              <span className={fn}>formatDate</span>
              <span className={pl}>{" }"} </span>
              <span className={kw}>from</span>{" "}
              <span className={st}>&quot;@/lib/format&quot;</span>
              <span className={pu}>;</span>
            </Ln>
            <Ln n={3}> </Ln>
            <Ln n={4}>
              <span className={kw}>export function</span>{" "}
              <span className={fn}>useActivity</span>
              <span className={pu}>(</span>
              <span className={pl}>events</span>
              <span className={pu}>: </span>
              <span className={pr}>Event</span>
              <span className={pu}>[]) {"{"}</span>
            </Ln>
            <Ln n={5}>
              <span className={pl}>{"  "}</span>
              <span className={kw}>const</span>{" "}
              <span className={pl}>recent</span> <span className={pu}>=</span>{" "}
              <span className={fn}>useMemo</span>
              <span className={pu}>{"(() => {"}</span>
            </Ln>
            <Ln n={6}>
              <span className={pl}>{"    "}</span>
              <span className={kw}>return</span>{" "}
              <span className={pl}>events</span>
            </Ln>
            <Ln n={7}>
              <span className={pl}>{"      "}</span>
              <span className={pu}>.</span>
              <span className={fn}>filter</span>
              <span className={pu}>((</span>
              <span className={pl}>event</span>
              <span className={pu}>{") => "}</span>
              <span className={pl}>event</span>
              <span className={pu}>.</span>
              <span className={pr}>visible</span>
              <span className={pu}>)</span>
            </Ln>
            <Ln n={8}>
              <span className={pl}>{"      "}</span>
              <span className={pu}>.</span>
              <span className={fn}>sort</span>
              <span className={pu}>{"((a, b) => b.at - a.at)"}</span>
            </Ln>
            <Ln n={9}>
              <span className={pl}>{"      "}</span>
              <span className={pu}>.</span>
              <span className={fn}>slice</span>
              <span className={pu}>(</span>
              <span className={nu}>0</span>
              <span className={pu}>, </span>
              <span className={nu}>8</span>
              <span className={pu}>);</span>
            </Ln>
            <Ln n={10}>
              <span className={pl}>{"  "}</span>
              <span className={pu}>{"}, ["}</span>
              <span className={pl}>events</span>
              <span className={pu}>]);</span>
            </Ln>
            <Ln n={11}> </Ln>
            <Ln n={12}>
              <span className={pl}>{"  "}</span>
              <span className={kw}>return</span>{" "}
              <span className={pl}>recent</span>
              <span className={pu}>.</span>
              <span className={fn}>map</span>
              <span className={pu}>((</span>
              <span className={pl}>event</span>
              <span className={pu}>{") => ({"}</span>
            </Ln>
            <Ln n={13}>
              <span className={pl}>{"    "}</span>
              <span className={pu}>...</span>
              <span className={pl}>event</span>
              <span className={pu}>,</span>
            </Ln>
            <Ln n={14}>
              <span className={pl}>{"    "}</span>
              <span className={pr}>label</span>
              <span className={pu}>: </span>
              <span className={fn}>formatDate</span>
              <span className={pu}>(</span>
              <span className={pl}>event</span>
              <span className={pu}>.</span>
              <span className={pr}>at</span>
              <span className={pu}>),</span>
            </Ln>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-44 bg-[linear-gradient(to_right,transparent,var(--color-white))] dark:bg-[linear-gradient(to_right,transparent,var(--color-black))]"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-[linear-gradient(to_top,var(--color-white),transparent)] dark:bg-[linear-gradient(to_top,var(--color-black),transparent)]"
        />

        <div
          className="absolute z-20 rounded-2xl bg-linear-to-b from-neutral-100/70 to-white px-5 pt-5 pb-10 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),inset_0_2.5px_0_0_rgba(255,255,255,1),0_6px_18px_-12px_rgba(0,0,0,0.12)] backdrop-blur-md backdrop-saturate-150 [-webkit-backdrop-filter:blur(12px)_saturate(1.5)] dark:bg-none dark:bg-[#242424]/78 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_0_0_1px_rgba(255,255,255,0.1),0_18px_40px_-16px_rgba(0,0,0,0.5)]"
          style={{ left: 36, top: 210, width: 324 }}
        >
          <p className="text-[13px] leading-relaxed text-neutral-800 dark:text-neutral-100">
            Add a workspace overview with team activity,{" "}
            <span className="text-neutral-400 dark:text-neutral-500">
              recent files, and usage stats.
            </span>
          </p>
        </div>
      </div>
    </FitScale>
  );
};

export default CodePrompt;
