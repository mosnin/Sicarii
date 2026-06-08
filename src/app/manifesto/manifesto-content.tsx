"use client";

import { motion } from "motion/react";

const easeOut = [0.16, 1, 0.3, 1] as const;

// The manifesto: a standalone, full-bleed red statement page. Deliberately its
// own art direction (not the baby-blue product UI). Fonts come in via next/font
// (self-hosted, so the strict CSP allows them); `fontClassName` carries the
// --font-manrope / --font-italiana / --font-marck variables those utilities use.
export function ManifestoContent({ fontClassName }: { fontClassName: string }) {
  return (
    <section
      className={`${fontClassName} font-manrope relative z-10 flex min-h-screen w-full flex-col bg-[#FF0000]`}
    >
      {/* 1. Centered content */}
      <div className="flex w-full flex-1 flex-col items-center pt-[100px] md:pt-[400px]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: easeOut }}
          className="relative z-20 mx-auto flex h-auto w-full max-w-[900px] flex-col items-center px-8 text-center md:h-[620px]"
        >
          {/* a) Logo */}
          <svg
            width="80"
            height="80"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-12"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M60 120C26.8629 120 0 93.1371 0 60V0C22.5654 0 42.2213 12.4569 52.4662 30.8691C38.4788 34.2089 28.0787 46.7902 28.0787 61.8006V63.1443C28.0787 79.9648 41.7146 93.6006 58.5353 93.6006H59.8789L59.8785 61.8006C59.8785 79.3633 74.1159 93.6006 91.6787 93.6006L91.6787 61.8006C91.6787 44.2783 77.5071 30.0661 60 30.0008L60 0H62.5352C94.2722 0 120 25.7279 120 57.4648V60C120 93.1371 93.1371 120 60 120Z"
              fill="white"
            />
          </svg>

          {/* b) Mission statement */}
          <p className="mx-auto mb-[40px] h-[100px] w-full max-w-[400px] text-[16px] uppercase leading-[1.6] tracking-wider text-white">
            We built this platform with a single purpose to eliminate operational
            chaos and restore balance to your daily business routine
          </p>

          {/* c) Cursive signature */}
          <div className="font-marck mb-[32px] text-[120px] leading-none text-white">
            S.P.D
          </div>

          {/* d) Two paragraphs */}
          <div className="mb-[100px] flex w-full flex-col items-center font-light leading-[1.6] text-white md:mb-24">
            <p className="mb-[24px] w-[400px] max-w-full text-center text-[16px]">
              I Was Exhausted By Software That Demanded More Effort Than It
              Actually Saved. That Is Why We Engineered An Autonomous Architecture
              That Operates Silently In The Background.
            </p>
            <p className="w-[400px] max-w-full text-center text-[16px]">
              Your Business Should Serve Your Life, Not Consume It. Let Our
              Algorithms Handle The Heavy Lifting, So You Can Focus On The Vision.
            </p>
          </div>
        </motion.div>
      </div>

      {/* 2. Bottom video with red gradient blend */}
      <div className="relative w-full shrink-0">
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-[100px] w-full bg-gradient-to-b from-[#FF0000] to-transparent" />
        <video
          autoPlay
          loop
          muted
          playsInline
          className="block h-auto w-full object-contain"
        >
          <source
            src="https://res.cloudinary.com/daklr2whx/video/upload/v1778602552/track-video_2_s9lp53.mp4"
            type="video/mp4"
          />
        </video>
      </div>
    </section>
  );
}
