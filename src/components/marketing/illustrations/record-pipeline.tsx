"use client";

import gsap from "gsap";
import { cn } from "@/lib/utils";
import { useGSAP } from "@gsap/react";
import { TbLoader } from "react-icons/tb";
import { IoMdCheckmark } from "react-icons/io";
import React, { useRef } from "react";

import { FitScale } from "./fit-scale";

export function RecordPipeline({
  labelHead = "Checking",
  label1 = "Real company",
  label2 = "Deduped",
  label3 = "Enriched",
}: {
  labelHead?: string;
  label1?: string;
  label2?: string;
  label3?: string;
}) {
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
        boxShadow: "0px 0px 5px 2px rgba(90, 176, 232, 1)",
        duration: 1.5,
        delay: 0.2,
      });
      tl.to(
        topBarsRef.current,
        {
          backgroundColor: "var(--primary)",
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
        { backgroundColor: "var(--primary)", stagger: 0.12, duration: 0.3 },
        "end",
      );
      tl.to(secondBoxRef.current, {
        boxShadow: "0px 0px 5px 2px rgba(90, 176, 232, 1)",
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
                "h-2 bg-muted-foreground/25",
                width === 4 ? "w-1" : "w-1.5",
              )}
            />
          ))}
        </div>

        <div
          className={cn(
            "flex h-32.25 w-28 flex-col sm:w-45",
            "divide-y overflow-hidden rounded-md",
            "border border-border",
          )}
        >
          <div className="flex items-center gap-1.5 bg-muted px-1 py-1.5">
            <span ref={spinnerRef}>
              <TbLoader className="text-primary/70 size-3.5" />
            </span>
            <p className="text-[12px] text-muted-foreground">
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
                "h-0.5 bg-muted-foreground/25",
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
    <div className="flex items-center justify-between bg-muted px-2 py-1.5 text-[13px] font-medium text-foreground">
      <p>{label}</p>
      <div className="relative">
        <svg width="20" height="20" className="-rotate-90">
          <circle
            ref={loaderRef}
            cx="10"
            cy="10"
            r="4.5"
            stroke="var(--primary)"
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
            fill="var(--primary)"
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
      style={{ boxShadow: "0px 0px 5px 2px rgba(90, 176, 232, 0)" }}
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-md p-2",
        "border border-border",
        "bg-card",
      )}
    >
      {icon}
    </div>
  );
};

const DataIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <g
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </g>
  </svg>
);

const BrainIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <g
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    >
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </g>
  </svg>
);

