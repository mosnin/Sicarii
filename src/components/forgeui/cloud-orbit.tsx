"use client";

import { cn } from "@/lib/utils";
import { motion, Variants } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaAws, FaCloudflare, FaDocker, FaSlack } from "react-icons/fa6";
import { SiDigitalocean, SiPlanetscale } from "react-icons/si";
import { BsOpenai } from "react-icons/bs";

type CloudOrbitProps = {
  centerIcon?: React.ComponentType<{ className?: string }>;
  firstIcon?: React.ComponentType<{ className?: string }>;
  secondIcon?: React.ComponentType<{ className?: string }>;
  thirdIcon?: React.ComponentType<{ className?: string }>;
  fourthIcon?: React.ComponentType<{ className?: string }>;
  fifthIcon?: React.ComponentType<{ className?: string }>;
  sixthIcon?: React.ComponentType<{ className?: string }>;
};

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

const CloudOrbit = ({
  centerIcon = BsOpenai,
  firstIcon = FaSlack,
  secondIcon = FaCloudflare,
  thirdIcon = SiPlanetscale,
  fourthIcon = FaAws,
  fifthIcon = FaDocker,
  sixthIcon = SiDigitalocean,
}: CloudOrbitProps) => {
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationKey((prev) => prev + 1);
    }, 3500);

    return () => clearInterval(interval);
  });

  return (
    <FitScale width={330} height={220}>
      <CloudOrbitScene
        key={animationKey}
        centerIcon={centerIcon}
        firstIcon={firstIcon}
        secondIcon={secondIcon}
        thirdIcon={thirdIcon}
        fourthIcon={fourthIcon}
        fifthIcon={fifthIcon}
        sixthIcon={sixthIcon}
      />
    </FitScale>
  );
};

export default CloudOrbit;

const CloudOrbitScene = ({
  centerIcon: CenterIcon,
  firstIcon,
  secondIcon,
  thirdIcon,
  fourthIcon,
  fifthIcon,
  sixthIcon,
}: CloudOrbitProps) => {
  const icons = [
    {
      class: "top-1/2 left-3 sm:left-[6px] border-r",
      Icon: firstIcon,
      direction: -3,
    },
    {
      class: "top-[52px] left-[28px] border-r",
      Icon: secondIcon,
      direction: -3,
    },
    {
      class: "bottom-[32px] left-[28px] border-r",
      Icon: thirdIcon,
      direction: -3,
    },
    {
      class: "top-1/2 right-3 sm:right-[6px] border-l",
      Icon: fourthIcon,
      direction: 3,
    },
    {
      class: "top-[52px] right-[28px] border-l",
      Icon: fifthIcon,
      direction: 3,
    },
    {
      class: "right-[28px] bottom-[32px] border-l",
      Icon: sixthIcon,
      direction: 3,
    },
  ];

  const pulseVariants: Variants = {
    open: {
      boxShadow: [
        "0 0 0 0 var(--pulse-color) inset",
        "0 0 10px 1px var(--pulse-color) inset",
        "0 0 10px 1px var(--pulse-color) inset",
        "0 0 0 0 var(--pulse-color) inset",
      ],
      scale: [1, 0.9, 0.9, 1],
      transition: {
        duration: 1.7,
        times: [0, 0.75, 0.85, 1],
        delay: 0.2,
        ease: "easeInOut",
      },
    },
    close: {
      boxShadow: "0 0 0 0 var(--pulse-color) inset",
      scale: 1,
      transition: { duration: 0.1, ease: "easeInOut" },
    },
  };

  return (
    <div className="relative mx-auto h-55 w-full max-w-82.5 min-w-82.5 overflow-hidden">
      <div className="absolute top-0 left-6 h-full w-30 [--beam-color:#000] dark:[--beam-color:#fff]">
        <AnimatedLeftPaths />
      </div>
      <div className="absolute top-0 right-6 h-full w-30 [--beam-color:#000] dark:[--beam-color:#fff]">
        <AnimatedRightPaths />
      </div>
      {icons.map(({ class: pos, Icon, direction }, i) => (
        <motion.div
          key={i}
          className={cn(
            pos,
            "absolute -mt-5",
            "shadow-[0_2px_2px_rgb(0,0,0,0.1)]",
            "bg-linear-to-b from-neutral-300 to-neutral-100",
            "dark:from-neutral-700 dark:to-neutral-900",
            "flex h-10 w-10 items-center justify-center rounded-full",
            "[--animated-border-rgb:0_0_0] dark:[--animated-border-rgb:255_255_255]",
          )}
          initial={{
            transform: "translateX(0px)",
            "--animated-border-opacity": 0,
          }}
          animate={{
            transform: [
              "translateX(0px)",
              `translateX(${direction}px)`,
              `translateX(0px)`,
            ],
            "--animated-border-opacity": [0, 1, 1, 0],
          }}
          transition={{
            transform: {
              duration: 1.3,
              ease: "easeInOut",
              delay: 2,
            },
            "--animated-border-opacity": {
              duration: 1,
              ease: "easeOut",
              delay: 2.1,
              times: [0, 0.2, 0.8, 1],
            },
          }}
          style={{
            borderColor: `rgb(var(--animated-border-rgb) / var(--animated-border-opacity))`,
          }}
        >
          {Icon && <Icon className="text-primary size-6" />}
        </motion.div>
      ))}
      <motion.div
        variants={pulseVariants}
        initial="close"
        animate="open"
        className={cn(
          "absolute inset-x-0 top-1/2 mx-auto -mt-11.25 flex h-22.5 w-22.5",
          "items-center justify-center rounded-full border",
          "border-neutral-200 dark:border-neutral-800",
          "bg-linear-to-br from-neutral-300 to-neutral-100 dark:from-neutral-800 dark:to-neutral-950",
          "[--pulse-color:rgba(0,0,0,1)] dark:[--pulse-color:rgba(255,255,255,1)]",
        )}
      >
        {CenterIcon && <CenterIcon className="text-primary size-10" />}
      </motion.div>
      <style>{`
      .integrationline {
  offset-anchor: 10px 0px;
  animation: integrationline-animation-path;
  animation-timing-function: cubic-bezier(0.275, 0.72, 0.165, 0.99);
  animation-duration: 2.5s;
  animation-delay: 1.7s;
}

.io-line-1 {
  offset-path: path("M 68 30 l -20 -15 q -5 -4 -6 -4 h -60");
}
.io-line-2 {
  offset-path: path("M 65 42 h -100");
}
.io-line-3 {
  offset-path: path("M 65 49 h -100");
}
.io-line-4 {
  offset-path: path("M 68 61 l -20 15 q -5 4 -6 4 h -60");
}
.io-line-5 {
  offset-path: path("M 3 30 l 20 -15 q 5 -4 6 -4 h 90");
}
.io-line-6 {
  offset-path: path("M 5 42 h 100");
}
.io-line-7 {
  offset-path: path("M 5 49 h 100");
}
.io-line-8 {
  offset-path: path("M 3 61 l 20 15 q 5 4 6 4 h 90");
}

@keyframes integrationline-animation-path {
  0% {
    offset-distance: 0%;
  }
  100% {
    offset-distance: 100%;
  }
}

      `}</style>
    </div>
  );
};

const AnimatedLeftPaths = () => {
  return (
    <svg
      className="h-full w-full text-[#d4d4d4] dark:text-neutral-800"
      width="100%"
      height="100%"
      viewBox="0 0 70 90"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="0.3">
        <path d="M 65 30 l -20 -15 q -5 -4 -6 -4 h -17" />
        <path d="M 65 42 h -60" />
        <path d="M 65 49 h -60" />
        <path d="M 65 61 l -20 15 q -5 4 -6 4 h -17" />
      </g>
      <g mask="url(#io-mask-1)">
        <circle
          className="integrationline io-line-1"
          cx="0"
          cy="0"
          r="12"
          fill="url(#io1-color-grad)"
        />
      </g>
      <g mask="url(#io-mask-2)">
        <circle
          className="integrationline io-line-2"
          cx="0"
          cy="0"
          r="12"
          fill="url(#io1-color-grad)"
        />
      </g>
      <g mask="url(#io-mask-3)">
        <circle
          className="integrationline io-line-3"
          cx="0"
          cy="0"
          r="12"
          fill="url(#io1-color-grad)"
        />
      </g>
      <g mask="url(#io-mask-4)">
        <circle
          className="integrationline io-line-4"
          cx="0"
          cy="0"
          r="12"
          fill="url(#io1-color-grad)"
        />
      </g>

      <defs>
        <mask id="io-mask-1">
          <path
            d="M 65 30 l -20 -15 q -5 -4 -6 -4 h -17"
            strokeWidth="0.4"
            stroke="white"
          />
        </mask>
        <mask id="io-mask-2">
          <path d="M 65 42 h -60" strokeWidth="0.4" stroke="white" />
        </mask>
        <mask id="io-mask-3">
          <path d="M 65 49 h -60" strokeWidth="0.4" stroke="white" />
        </mask>
        <mask id="io-mask-4">
          <path
            d="M 65 61 l -20 15 q -5 4 -6 4 h -17"
            strokeWidth="0.4"
            stroke="white"
          />
        </mask>
        <radialGradient id="io1-color-grad" fx="1">
          <stop offset="0%" stopColor={"var(--beam-color)"} />
          <stop offset="30%" stopColor={"var(--beam-color)"} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
    </svg>
  );
};

const AnimatedRightPaths = () => {
  return (
    <svg
      className="h-full w-full text-[#d4d4d4] dark:text-neutral-800"
      width="100%"
      height="100%"
      viewBox="0 0 70 90"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="0.3">
        <path d="M 5 30 l 20 -15 q 5 -4 6 -4 h 17 " />
        <path d="M 5 42 h 60" />
        <path d="M 5 49 h 60" />
        <path d="M 5 61 l 20 15 q 5 4 6 4 h 17" />
      </g>
      <g mask="url(#io-mask-5)">
        <circle
          className="integrationline io-line-5"
          cx="0"
          cy="0"
          r="12"
          fill="url(#io2-color-grad)"
        />
      </g>
      <g mask="url(#io-mask-6)">
        <circle
          className="integrationline io-line-6"
          cx="0"
          cy="0"
          r="12"
          fill="url(#io2-color-grad)"
        />
      </g>
      <g mask="url(#io-mask-7)">
        <circle
          className="integrationline io-line-7"
          cx="0"
          cy="0"
          r="12"
          fill="url(#io2-color-grad)"
        />
      </g>
      <g mask="url(#io-mask-8)">
        <circle
          className="integrationline io-line-8"
          cx="0"
          cy="0"
          r="12"
          fill="url(#io2-color-grad)"
        />
      </g>

      <defs>
        <mask id="io-mask-5">
          <path
            d="M 5 30 l 20 -15 q 5 -4 6 -4 h 17"
            strokeWidth="0.4"
            stroke="white"
          />
        </mask>
        <mask id="io-mask-6">
          <path d="M 5 42 h 60" strokeWidth="0.4" stroke="white" />
        </mask>
        <mask id="io-mask-7">
          <path d="M 5 49 h 60" strokeWidth="0.4" stroke="white" />
        </mask>
        <mask id="io-mask-8">
          <path
            d="M 5 61 l 20 15 q 5 4 6 4 h 17"
            strokeWidth="0.4"
            stroke="white"
          />
        </mask>
        <radialGradient id="io2-color-grad" fx="1">
          <stop offset="0%" stopColor={"var(--beam-color)"} />
          <stop offset="30%" stopColor={"var(--beam-color)"} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
    </svg>
  );
};
