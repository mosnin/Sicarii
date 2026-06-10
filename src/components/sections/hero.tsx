"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ChevronRight } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

// The ambient background video. Kept exactly as specified for the glassmorphism
// aesthetic; it pauses for prefers-reduced-motion.
const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260428_193507_4286c423-2fd9-4efd-92bd-91a939453fc1.mp4";

// A glass pill eyebrow. Harmonized to the Scalar system: a live primary dot
// instead of a decorative icon-in-a-box.
function HeroBadge() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-white/40 bg-white/60 px-4 py-2 backdrop-blur-md"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      <span className="text-[14px] font-medium text-foreground/80">The CRM your agents run</span>
    </motion.div>
  );
}

// Bottom-left glass card. The RIVR vanity metric is replaced by an honest
// ownership line (Scalar bans faux metrics), and the pill drops the
// icon-in-a-circle for a clean arrow affordance.
function BottomLeftCard() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
      className="absolute bottom-28 right-4 left-auto flex w-fit min-w-[140px] flex-col gap-2 rounded-[1.2rem] bg-white/30 p-3 backdrop-blur-xl md:bottom-6 md:left-6 md:right-auto md:min-w-[150px] md:rounded-[1.5rem] md:p-4 lg:bottom-10 lg:left-10 lg:min-w-[180px] lg:gap-3 lg:rounded-[2.2rem] lg:p-5"
    >
      <div className="flex flex-col">
        <span className="font-brand text-2xl tracking-tight text-foreground md:text-3xl">Yours</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/60 md:text-[12px]">
          Your data, exportable
        </span>
      </div>
      <motion.div
        whileHover={reduce ? undefined : { scale: 1.02 }}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        className="self-start"
      >
        <Link
          href="/sign-up"
          className="group flex items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-5 transition-colors hover:bg-white/90"
        >
          <span className="text-[14px] font-medium text-foreground/90">Get started</span>
          <ArrowUpRight className="h-4 w-4 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </motion.div>
    </motion.div>
  );
}

// Bottom-right faux-cutout corner. The concave joins are masked with two SVG
// quarter-circles filled with the page background. The decorative icon-circle
// is dropped; the ChevronRight stays as a functional link affordance.
function BottomRightCorner() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
      className="absolute bottom-0 right-0 flex items-center gap-3 rounded-tl-[1.5rem] bg-background p-3 pl-8 pt-5 sm:gap-4 sm:rounded-tl-[2rem] sm:p-4 sm:pl-10 sm:pt-6 md:gap-6 md:rounded-tl-[3.5rem] md:p-6 md:pl-14 md:pt-8"
    >
      {/* Top intersection mask */}
      <div className="pointer-events-none absolute -top-[1.5rem] right-0 h-[1.5rem] w-[1.5rem] text-background sm:-top-[2rem] sm:h-[2rem] sm:w-[2rem] md:-top-[3.5rem] md:h-[3.5rem] md:w-[3.5rem]">
        <svg width="100%" height="100%" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M56 56V0C56 30.9279 30.9279 56 0 56H56Z" fill="currentColor" />
        </svg>
      </div>
      {/* Left intersection mask */}
      <div className="pointer-events-none absolute bottom-0 -left-[1.5rem] h-[1.5rem] w-[1.5rem] text-background sm:-left-[2rem] sm:h-[2rem] sm:w-[2rem] md:-left-[3.5rem] md:h-[3.5rem] md:w-[3.5rem]">
        <svg width="100%" height="100%" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M56 56H0C30.9279 56 56 30.9279 56 0V56Z" fill="currentColor" />
        </svg>
      </div>

      <div className="flex flex-col">
        <Link
          href="/integrations"
          className="font-brand text-[16px] text-foreground transition-colors hover:text-primary md:text-[20px]"
        >
          Bring your own agent
        </Link>
        <Link
          href="/integrations"
          className="flex items-center gap-1 text-foreground/60 transition-colors hover:text-foreground/80"
        >
          <span className="text-[12px] font-medium md:text-[15px]">Connect over MCP</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </motion.div>
  );
}

export function HeroSection() {
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Honor reduced motion: pause the ambient video and rest on its first frame.
  useEffect(() => {
    if (reduce) videoRef.current?.pause();
  }, [reduce]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-3 md:p-5">
      <section className="group relative flex h-full w-full max-w-[1536px] flex-col items-center overflow-hidden rounded-[1.5rem] bg-white/10 shadow-none md:rounded-[3rem]">
        {/* Ambient video background */}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          src={VIDEO_SRC}
          className="absolute inset-0 z-0 h-full w-full object-cover object-[65%] lg:object-center"
        />
        {/* Soft scrim so the dark text reads over any frame */}
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-background/50 via-background/0 to-background/25" />

        {/* Content layer */}
        <div className="relative z-10 flex h-full w-full flex-col items-center">
          {/* Spacer: lets the floating pill header sit cleanly over the video */}
          <div className="h-24 shrink-0" aria-hidden />

          <div className="flex w-full max-w-4xl flex-col items-center px-6 pt-8 text-center">
            <HeroBadge />
            <motion.h1
              initial={reduce ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
              className="mb-2 font-brand text-4xl font-normal leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[80px]"
            >
              Lead intelligence at <span className="text-gradient-orange">agent speed</span>
            </motion.h1>
            <motion.p
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="max-w-xl text-sm font-normal leading-relaxed text-foreground/70 sm:text-base md:text-lg"
            >
              Point your agent at a name, a domain, or a prompt. It finds the
              right companies, surfaces who is in-market, and enriches every
              record. Structured, deduped, and yours.
            </motion.p>
          </div>

          <BottomLeftCard />
          <BottomRightCorner />
        </div>
      </section>
    </div>
  );
}
