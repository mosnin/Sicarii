"use client";

import gsap from "gsap";
import { cn } from "@/lib/utils";
import { useGSAP } from "@gsap/react";
import { IoIosCheckmarkCircle } from "react-icons/io";
import { LuLoader } from "react-icons/lu";
import React, { useRef } from "react";

import { FitScale } from "./fit-scale";

export function ThreeStepsLive({
  step1 = "Connecting your agent over MCP",
  step2 = "Describing who you sell to",
  step3 = "Finding and verifying companies",
  step4 = "Writing them into your CRM",
}: {
  step1?: string;
  step2?: string;
  step3?: string;
  step4?: string;
}) {
  const step1Ref = useRef(null);
  const step2Ref = useRef(null);
  const step3Ref = useRef(null);
  const step4Ref = useRef(null);
  const loader1Ref = useRef(null);
  const loader2Ref = useRef(null);
  const loader3Ref = useRef(null);
  const loader4Ref = useRef(null);
  const check1Ref = useRef(null);
  const check2Ref = useRef(null);
  const check3Ref = useRef(null);
  const check4Ref = useRef(null);
  const progressBar1Ref = useRef(null);
  const progressBar2Ref = useRef(null);
  const progressBar3Ref = useRef(null);
  const progressBar4Ref = useRef(null);

  useGSAP(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });

      tl.to(loader1Ref.current, {
        rotate: 780,
        duration: 3,
        ease: "sine.inOut",
      });
      tl.to(
        progressBar1Ref.current,
        { width: "100%", duration: 3, ease: "power1.inOut" },
        "<",
      );
      tl.to(loader1Ref.current, {
        opacity: 0,
        duration: 0.3,
        ease: "power1.inOut",
      });
      tl.to(
        check1Ref.current,
        { opacity: 1, duration: 0.2, ease: "power1.inOut" },
        "+=0.1",
      );
      tl.to(step1Ref.current, { y: -53, scale: 0.9, delay: 0.3 });
      tl.to(step2Ref.current, { y: -52.5, scale: 1 }, "<");
      tl.to(step3Ref.current, { y: -49 }, "<");
      tl.to(step4Ref.current, { y: -49 }, "<");
      tl.to(loader2Ref.current, {
        rotate: 780,
        duration: 3,
        ease: "sine.inOut",
      });
      tl.to(
        progressBar2Ref.current,
        { width: "100%", duration: 3, ease: "power1.inOut" },
        "<",
      );
      tl.to(loader2Ref.current, {
        opacity: 0,
        duration: 0.3,
        ease: "power1.inOut",
      });
      tl.to(
        check2Ref.current,
        { opacity: 1, duration: 0.2, ease: "power1.inOut" },
        "+=0.1",
      );
      tl.to(step1Ref.current, { y: -105, delay: 0.3 });
      tl.to(step2Ref.current, { y: -105, scale: 0.9 }, "<");
      tl.to(step3Ref.current, { y: -102, scale: 1 }, "<");
      tl.to(step4Ref.current, { y: -98 }, "<");
      tl.set(step1Ref.current, { y: 100 });
      tl.set(loader1Ref.current, { opacity: 1 });
      tl.set(check1Ref.current, { opacity: 0 });
      tl.set(progressBar1Ref.current, { width: "0%" });
      tl.to(loader3Ref.current, {
        rotate: 780,
        duration: 3,
        ease: "sine.inOut",
      });
      tl.to(
        progressBar3Ref.current,
        { width: "100%", duration: 3, ease: "power1.inOut" },
        "<",
      );
      tl.to(loader3Ref.current, {
        opacity: 0,
        duration: 0.3,
        ease: "power1.inOut",
      });
      tl.to(
        check3Ref.current,
        { opacity: 1, duration: 0.2, ease: "power1.inOut" },
        "+=0.1",
      );
      tl.to(step2Ref.current, { y: -154, delay: 0.3 });
      tl.to(step3Ref.current, { y: -154.5, scale: 0.9 }, "<");
      tl.to(step4Ref.current, { y: -150.5, scale: 1 }, "<");
      tl.to(step1Ref.current, { y: 53 }, "<");
      tl.set(step2Ref.current, { y: 50 });
      tl.set(loader2Ref.current, { opacity: 1 });
      tl.set(check2Ref.current, { opacity: 0 });
      tl.set(progressBar2Ref.current, { width: "0%" });
      tl.to(loader4Ref.current, {
        rotate: 780,
        duration: 3,
        ease: "sine.inOut",
      });
      tl.to(
        progressBar4Ref.current,
        { width: "100%", duration: 3, ease: "power1.inOut" },
        "<",
      );
      tl.to(loader4Ref.current, {
        opacity: 0,
        duration: 0.3,
        ease: "power1.inOut",
      });
      tl.to(
        check4Ref.current,
        { opacity: 1, duration: 0.2, ease: "power1.inOut" },
        "+=0.1",
      );
      tl.to(step3Ref.current, { y: -202.5, delay: 0.3 });
      tl.to(step4Ref.current, { y: -202, scale: 0.9 }, "<");
      tl.to(step1Ref.current, { y: 0, scale: 1 }, "<");
      tl.to(step2Ref.current, { y: 0 }, "<");
      tl.set(step3Ref.current, { y: 0 });
      tl.set(loader3Ref.current, { opacity: 1 });
      tl.set(check3Ref.current, { opacity: 0 });
      tl.set(progressBar3Ref.current, { width: "0%" });
      tl.to(step4Ref.current, {
        opacity: 0,
        duration: 0.4,
        ease: "sine.inOut",
      });
      tl.set(loader4Ref.current, { opacity: 1 });
      tl.set(check4Ref.current, { opacity: 0 });
      tl.set(progressBar4Ref.current, { width: "0%" });
      tl.set(step4Ref.current, { y: 0, opacity: 1 });
    });
    return () => ctx.revert();
  }, []);

  return (
    <FitScale width={400} height={260}>
      <div className="relative mx-auto h-55 w-full overflow-hidden">
        <StepCard
          title={step1}
          stepRef={step1Ref}
          checkRef={check1Ref}
          loaderRef={loader1Ref}
          progressRef={progressBar1Ref}
          className="top-20 scale-[1]"
        />
        <StepCard
          title={step2}
          stepRef={step2Ref}
          checkRef={check2Ref}
          loaderRef={loader2Ref}
          progressRef={progressBar2Ref}
          className="top-33 scale-[0.9]"
        />
        <StepCard
          title={step3}
          stepRef={step3Ref}
          checkRef={check3Ref}
          loaderRef={loader3Ref}
          progressRef={progressBar3Ref}
          className="top-45.5 scale-[0.9]"
        />
        <StepCard
          title={step4}
          stepRef={step4Ref}
          checkRef={check4Ref}
          loaderRef={loader4Ref}
          progressRef={progressBar4Ref}
          className="top-57.5 scale-[0.9]"
        />
        <ContainerMask />
      </div>
    </FitScale>
  );
};


const ContainerMask = () => {
  return (
    <>
      <div className="absolute bottom-0 left-0 h-10 w-full bg-[linear-gradient(to_top,var(--card),transparent)]" />
      <div className="absolute top-0 left-0 h-10 w-full bg-[linear-gradient(to_bottom,var(--card),transparent)]" />
    </>
  );
};

type StepCardProps = {
  title: string;
  stepRef?: React.Ref<HTMLDivElement>;
  checkRef?: React.Ref<HTMLSpanElement>;
  loaderRef?: React.Ref<HTMLSpanElement>;
  progressRef?: React.Ref<HTMLSpanElement>;
  className?: string;
};

export const StepCard = ({
  title,
  stepRef,
  checkRef,
  loaderRef,
  progressRef,
  className,
}: StepCardProps) => {
  return (
    <div
      ref={stepRef}
      className={cn(
        "text-primary rounded-md px-3 py-2 text-xs",
        "border border-border",
        "absolute inset-x-0 mx-auto flex h-12 w-[90%] max-w-62.5 gap-1.5",
        "bg-muted",
        className,
      )}
    >
      <div className="relative h-[30.4px] w-3.5">
        <span
          ref={checkRef}
          className="absolute inset-x-0 top-[2.5px] text-cyan-500 opacity-0"
        >
          <IoIosCheckmarkCircle size={14} />
        </span>
        <span
          ref={loaderRef}
          className="absolute inset-x-0 top-0.75 text-foreground opacity-100"
        >
          <LuLoader size={13} />
        </span>
      </div>

      <div className="flex w-full flex-col justify-between gap-2">
        <p>{title}</p>
        <div className="flex h-1.5 w-[90%] rounded-sm bg-muted">
          <span
            ref={progressRef}
            className="h-full w-[0%] rounded-sm bg-cyan-500"
          />
        </div>
      </div>
    </div>
  );
};
