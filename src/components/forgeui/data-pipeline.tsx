"use client";

import gsap from "gsap";
import { cn } from "@/lib/utils";
import { useGSAP } from "@gsap/react";
import { TbLoader } from "react-icons/tb";
import { IoMdCheckmark } from "react-icons/io";
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

const DataPipeline = ({
  labelHead = "Processing",
  label1 = "Filter",
  label2 = "Transform",
  label3 = "Refine",
}: {
  labelHead?: string;
  label1?: string;
  label2?: string;
  label3?: string;
}) => {
  const topBarsRef = useRef<HTMLDivElement[]>([]);
  const bottomBarsRef = useRef<HTMLDivElement[]>([]);
  const spinnerRef = useRef(null);
  const loader1Ref = useRef(null);
  const circle1Ref = useRef(null);
  const check1Ref = useRef(null);
  const loader2Ref = useRef(null);
  const circle2Ref = useRef(null);
  const check2Ref = useRef(null);
  const loader3Ref = useRef(null);
  const circle3Ref = useRef(null);
  const check3Ref = useRef(null);
  const firstBoxRef = useRef(null);
  const secondBoxRef = useRef(null);

  useGSAP(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });

      tl.to(firstBoxRef.current, {
        boxShadow: "0px 0px 5px 2px rgba(104, 211, 145, 1)",
        duration: 1.5,
        delay: 0.2,
      });
      tl.to(
        topBarsRef.current,
        {
          backgroundColor: "#22c55e",
          stagger: 0.12,
          duration: 0.3,
        },
        "start",
      );
      tl.to(
        spinnerRef.current,
        {
          rotation: 1500,
          ease: "power1.inOut",
          duration: 8,
        },
        "-=0.6",
      );
      tl.to(
        loader1Ref.current,
        { strokeDashoffset: 0, duration: 2, ease: "power1.inOut" },
        "<",
      );
      tl.to(
        circle1Ref.current,
        { opacity: 1, duration: 0.3, ease: "power2.out", delay: 2 },
        "<",
      );
      tl.to(
        check1Ref.current,
        { opacity: 1, duration: 0.3, ease: "power2.out" },
        "<",
      );
      tl.to(
        loader2Ref.current,
        { strokeDashoffset: 0, duration: 2, delay: 0.3, ease: "power1.inOut" },
        "<",
      );
      tl.to(
        circle2Ref.current,
        { opacity: 1, duration: 0.3, ease: "power2.out", delay: 2 },
        "<",
      );
      tl.to(
        check2Ref.current,
        { opacity: 1, duration: 0.3, ease: "power2.out" },
        "<",
      );
      tl.to(
        loader3Ref.current,
        { strokeDashoffset: 0, duration: 2, delay: 0.3, ease: "power1.inOut" },
        "<",
      );
      tl.to(
        circle3Ref.current,
        { opacity: 1, duration: 0.3, ease: "power2.out", delay: 2 },
        "<",
      );
      tl.to(
        check3Ref.current,
        { opacity: 1, duration: 0.3, ease: "power2.out" },
        "<",
      );
      tl.to({}, { duration: 0.5 });
      tl.to(
        bottomBarsRef.current,
        { backgroundColor: "#22c55e", stagger: 0.12, duration: 0.3 },
        "end",
      );
      tl.to(secondBoxRef.current, {
        boxShadow: "0px 0px 5px 2px rgba(104, 211, 145, 1)",
        duration: 1.5,
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <FitScale width={400} height={180}>
      <div className="mx-auto flex h-45 w-full max-w-80 items-center gap-1 px-1 sm:max-w-100">
        <GlowingBox
          icon={<DataIcon className="size-12" />}
          boxRef={firstBoxRef}
        />

        <div className="flex gap-px">
          {[4, 6, 6, 6, 6].map((width, idx) => (
            <div
              key={idx}
              ref={(el) => {
                if (el) topBarsRef.current[idx] = el;
              }}
              className={cn(
                "h-2 bg-neutral-300 dark:bg-neutral-700",
                width === 4 ? "w-1" : "w-1.5",
              )}
            />
          ))}
        </div>

        <div
          className={cn(
            "flex h-32.25 w-28 flex-col sm:w-45",
            "divide-y overflow-hidden rounded-md",
            "border border-neutral-300 dark:border-neutral-800",
          )}
        >
          <div className="flex items-center gap-1.5 bg-linear-to-br from-neutral-50 to-[#ededed] px-1 py-1.5 dark:from-neutral-800 dark:to-[#101010]">
            <span ref={spinnerRef}>
              <TbLoader className="text-primary/70 size-3.5" />
            </span>
            <p className="text-[12px] text-neutral-600 dark:text-neutral-400">
              {labelHead}
            </p>
          </div>
          <ProgressStep
            label={label1}
            loaderRef={loader1Ref}
            circleRef={circle1Ref}
            checkRef={check1Ref}
          />
          <ProgressStep
            label={label2}
            loaderRef={loader2Ref}
            circleRef={circle2Ref}
            checkRef={check2Ref}
          />
          <ProgressStep
            label={label3}
            loaderRef={loader3Ref}
            circleRef={circle3Ref}
            checkRef={check3Ref}
          />
        </div>

        <div className="flex gap-px">
          {[4, 6, 6, 6].map((width, idx) => (
            <div
              key={idx}
              ref={(el) => {
                if (el) bottomBarsRef.current[idx] = el;
              }}
              className={cn(
                "h-0.5 bg-neutral-300 dark:bg-neutral-700",
                width === 4 ? "w-1" : "w-1.5",
              )}
            />
          ))}
        </div>

        <GlowingBox
          icon={<BrainIcon className="size-16 scale-[1.4]" />}
          boxRef={secondBoxRef}
        />
      </div>
    </FitScale>
  );
};

export default DataPipeline;

type ProgressStepProps = {
  label: string;
  loaderRef?: React.Ref<SVGCircleElement>;
  circleRef?: React.Ref<SVGCircleElement>;
  checkRef?: React.Ref<HTMLDivElement>;
};

type GlowingBoxProps = {
  icon: React.ReactNode;
  boxRef?: React.Ref<HTMLDivElement>;
};

function ProgressStep({
  label,
  loaderRef,
  circleRef,
  checkRef,
}: ProgressStepProps) {
  return (
    <div className="text-primary/90 flex items-center justify-between bg-linear-to-r from-neutral-50 to-[#ededed] px-2 py-1.5 text-[13px] font-medium dark:from-[#1e1e1e] dark:to-[#141414]">
      <p>{label}</p>
      <div className="relative">
        <svg width="20" height="20" className="-rotate-90">
          <circle
            ref={loaderRef}
            cx="10"
            cy="10"
            r="4.5"
            stroke="#22c55e"
            strokeWidth="2"
            fill="transparent"
            strokeDasharray="29"
            strokeDashoffset="29"
          />
          <circle
            ref={circleRef}
            cx="10"
            cy="10"
            r="4.5"
            fill="#22c55e"
            className="opacity-0"
          />
        </svg>
        <div
          ref={checkRef}
          className="text-background absolute inset-0 flex items-center justify-center opacity-0"
        >
          <IoMdCheckmark className="size-2" />
        </div>
      </div>
    </div>
  );
}

const GlowingBox = ({ icon, boxRef }: GlowingBoxProps) => {
  return (
    <div
      ref={boxRef}
      style={{ boxShadow: "0px 0px 5px 2px rgba(104, 211, 145, 0)" }}
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-md p-2",
        "border border-neutral-300 dark:border-neutral-800",
        "bg-linear-to-b from-neutral-300 to-neutral-100 dark:from-neutral-700 dark:to-neutral-900",
      )}
    >
      {icon}
    </div>
  );
};

const DataIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="2048"
    height="2048"
    viewBox="0 0 2048 2048"
    fill="none"
    {...props}
  >
    <g>
      <path fill="none" d="M0 0h2048v2048H0z" />
      <path fill="none" d="M255.999 255.999h1536v1536h-1536z" />
      <path fill="none" d="M255.999 256h1536v1536h-1536z" />
      <path fill="none" d="M255.999 256h1536v1536h-1536z" />
      <path
        fill="#2e7d32"
        d="M1740.13 319.999h-588.735L857.852 479.381l-549.991-4.246c-18.906-.147-34.374 13.45-34.374 29.882v773.26c0 16.434 15.472 29.884 34.374 29.884h1432.27c18.905 0 34.374-13.447 34.374-29.883V349.88c0-16.436-15.468-29.882-34.374-29.882z"
      />
      <path
        fill="#efebe9"
        d="M562.197 491.637h923.606c18.906 0 34.374 15.47 34.374 34.374v963.65c0 18.903-15.47 34.372-34.374 34.372H562.197c-18.904 0-34.374-15.466-34.374-34.372V526.01c0-18.906 15.468-34.374 34.374-34.374z"
      />
      <path
        fill="#43a047"
        d="m307.865 611.507 614.297 1.442 299.76 291.605 518.213-4.603c18.906-.167 34.374 15.476 34.374 34.374v694.287c0 18.902-15.472 34.374-34.374 34.374H307.865c-18.904 0-34.374-15.468-34.374-34.374V645.88c0-18.906 15.468-34.416 34.374-34.373z"
      />
      <path
        fill="#66bb6a"
        d="M307.865 648.172H896.6l293.543 293.329 549.991-4.884c18.906-.168 34.374 15.474 34.374 34.373v530.638c0 18.9-15.473 34.373-34.374 34.373H307.864c-18.902 0-34.374-15.467-34.374-34.373V682.546c0-18.906 15.468-34.374 34.374-34.374z"
      />
    </g>
  </svg>
);

const BrainIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    version="1.1"
    id="icons"
    xmlns="http://www.w3.org/2000/svg"
    x="0"
    y="0"
    viewBox="0 0 64 64"
    xmlSpace="preserve"
    {...props}
  >
    <path
      d="M36.1 19.5s3.5.7 3.6 3.5c0 0 3.2.6 2.2 4.4 0 0 2.4 1.8 1.6 6 0 0 3.3 2.2-.4 5.6v.4s.5 2.7-2.7 5c0 0-1.3 1.1-3.5 3.7-1 1.3-4.4 2.7-6.1-2.3V20.4c.3 0 2.4-4.1 5.3-.9z"
      fill="#d1d3d4"
    />
    <path
      d="M25.4 19.5s-3.5.7-3.6 3.5c0 0-3.2.6-2.2 4.4 0 0-2.4 1.8-1.6 6 0 0-3.3 2.2.4 5.6v.4s-.5 2.7 2.7 5c0 0 1.3 1.1 3.5 3.7 1 1.3 4.4 2.7 6.1-2.3V20.4c-.3 0-2.4-4.1-5.3-.9z"
      fill="#22c55e "
    />
    <g stroke="#414042" fill="none" strokeMiterlimit={10}>
      <path d="M40.1 29.5c-.8.5-1.7.7-2.6.5-.9-.2-1.6-.7-2.2-1.4-.5-.8-.7-1.7-.5-2.6" />
      <path d="M37.5 38.2c-.8.5-1.7.7-2.6.5-.9-.2-1.6-.7-2.2-1.4-.5-.8-.7-1.7-.5-2.6" />
      <path d="M43.3 38.9c-.8 0-1.4-.4-1.9-.9s-.7-1.2-.7-2 .4-1.4.9-1.9" />
      <path d="M35 33.5c-.6-.7-.9-1.5-.8-2.5.1-.9.5-1.8 1.2-2.3" />
      <path d="M41.1 37.7c-.3-.8-.9-1.5-1.7-1.9-.8-.4-1.8-.4-2.6-.1" />
      <path d="M37.3 24.8c-.6-.6-1.1-1.4-1.1-2.4 0-.9.3-1.8.9-2.5" />
      <path d="M32.8 24.9c.9 0 1.7-.3 2.4-1s1-1.5 1-2.4" />
      <path d="M33.3 46.8c.7-.7 1.5-1 2.4-1 .9 0 1.7.3 2.4 1" />
      <path d="M34.9 41.5c-.3.9-.3 1.8 0 2.6s1 1.5 1.9 1.8" />
      <path d="M21.4 29.5c.8.5 1.7.7 2.6.5.9-.2 1.6-.7 2.2-1.4.5-.8.7-1.7.5-2.6" />
      <path d="M24 38.2c.8.5 1.7.7 2.6.5.9-.2 1.6-.7 2.2-1.4.5-.8.7-1.7.5-2.6" />
      <path d="M18.2 38.9c.8 0 1.4-.4 1.9-.9s.7-1.2.7-2-.4-1.4-.9-1.9" />
      <path d="M26.5 33.5c.6-.7.9-1.5.8-2.5-.1-.9-.5-1.8-1.2-2.3" />
      <path d="M20.4 37.7c.3-.8.9-1.5 1.7-1.9.8-.4 1.8-.4 2.6-.1" />
      <path d="M24.2 24.8c.6-.6 1.1-1.4 1.1-2.4 0-.9-.3-1.8-.9-2.5" />
      <path d="M28.7 25c-.9 0-1.7-.3-2.4-1s-1-1.5-1-2.4" />
      <path d="M28.2 46.8c-.7-.7-1.5-1-2.4-1-.9 0-1.7.3-2.4 1" />
      <path d="M26.6 41.5c.3.9.3 1.8 0 2.6s-1 1.5-1.9 1.8" />
      <circle
        cx={13.9}
        cy={26.7}
        r={1}
        className="stroke-neutral-400 dark:stroke-neutral-500"
      />
      <circle
        cx={42.6}
        cy={16.9}
        r={0.9}
        className="stroke-neutral-400 dark:stroke-neutral-500"
      />
      <circle
        cx={48.7}
        cy={34.1}
        r={0.9}
        className="stroke-neutral-400 dark:stroke-neutral-500"
      />
      <circle
        cx={29.3}
        cy={52.4}
        r={0.8}
        className="stroke-neutral-400 dark:stroke-neutral-500"
      />
    </g>
  </svg>
);
