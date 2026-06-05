"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";

// Scalar taglines — one picked at random each mount.
const TAGLINES = [
  "Your agents are already working.",
  "Research, enriched.",
  "Context is everything.",
  "The CRM your agents run.",
  "Quiet leverage, working for you.",
];

const easeOut = [0.16, 1, 0.3, 1] as const;

const SEEN_KEY = "scalar_preloader_seen";

/** Mark the session as seen and return whether to show the preloader. */
function claimSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  if (sessionStorage.getItem(SEEN_KEY)) return false;
  sessionStorage.setItem(SEEN_KEY, "1");
  return true;
}

export function DashboardPreloader({ name }: { name: string }) {
  const reduce = useReducedMotion();

  // Lazy initializer: reads sessionStorage once, outside the render cycle.
  const [show, setShow] = useState<boolean>(() => claimSession());

  // Dismiss after hold duration.
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), reduce ? 900 : 2100);
    return () => clearTimeout(t);
  }, [show, reduce]);

  // Pick a random tagline once — lazy initializer avoids impure render calls.
  const [tagline] = useState<string>(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);

  const words = tagline.split(" ");

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-background dark:bg-charcoal-dark"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(14px)", scale: 1.04 }}
          transition={{ duration: 0.5, ease: easeOut }}
        >
          {/* ASCII field — more visible: opacity-25 in light, opacity-20 in dark */}
          <AsciiField
            className="absolute inset-0 h-full w-full opacity-25"
            cell={14}
          />

          {/* Soft baby-blue radial glow centred behind the content */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 55% 45% at 50% 48%, rgba(90,176,232,0.18) 0%, transparent 65%)",
            }}
          />

          {/* Full-screen shimmer sweep — moves diagonally across the whole overlay once */}
          {!reduce && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[1]"
              initial={{ x: "-120%", skewX: -12 }}
              animate={{ x: "120%" }}
              transition={{
                duration: 1.1,
                ease: "easeInOut",
                delay: 0.7 + words.length * 0.07,
              }}
              style={{
                background:
                  "linear-gradient(105deg, transparent 25%, rgba(90,176,232,0.12) 45%, rgba(143,204,242,0.18) 52%, rgba(90,176,232,0.10) 58%, transparent 75%)",
                mixBlendMode: "screen",
                width: "60%",
                left: 0,
              }}
            />
          )}

          {/* Content */}
          <div className="relative z-10 px-6 text-center">
            {/* Eyebrow greeting */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: easeOut, delay: 0.1 }}
              className="text-xs uppercase tracking-[0.35em] text-primary/80"
            >
              Good to see you{name ? `, ${name}` : ""}
            </motion.p>

            {/* Tagline — word-by-word blur→clear stagger */}
            <motion.h1
              className="font-brand relative mt-4 max-w-3xl text-3xl text-foreground sm:text-5xl lg:text-6xl"
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: {
                  transition: {
                    staggerChildren: reduce ? 0 : 0.07,
                    delayChildren: reduce ? 0 : 0.25,
                  },
                },
              }}
            >
              {words.map((w, i) => (
                <motion.span
                  key={i}
                  className="mr-[0.25em] inline-block"
                  variants={{
                    hidden: {
                      opacity: 0,
                      y: "0.4em",
                      filter: "blur(10px)",
                    },
                    show: {
                      opacity: 1,
                      y: 0,
                      filter: "blur(0px)",
                      transition: { duration: 0.55, ease: easeOut },
                    },
                  }}
                >
                  {w}
                </motion.span>
              ))}

              {/* Shimmer sweep that crosses the tagline itself once */}
              {!reduce && (
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  initial={{ x: "-110%" }}
                  animate={{ x: "110%" }}
                  transition={{
                    duration: 0.75,
                    ease: "easeInOut",
                    delay: 0.6 + words.length * 0.07,
                  }}
                  style={{
                    background:
                      "linear-gradient(105deg, transparent 30%, rgba(90,176,232,0.38) 50%, rgba(143,204,242,0.30) 55%, transparent 70%)",
                    mixBlendMode: "screen",
                  }}
                />
              )}
            </motion.h1>

            {/* Thin progress bar that sweeps scaleX 0→1 */}
            <motion.div
              className="mx-auto mt-8 h-px w-40 origin-left overflow-hidden"
              style={{ background: "rgba(90,176,232,0.18)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
            >
              <motion.div
                className="h-full w-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(90,176,232,0.6) 0%, rgba(143,204,242,1) 60%, rgba(90,176,232,0.6) 100%)",
                  originX: 0,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: reduce ? 0.6 : 1.55,
                  ease: easeOut,
                  delay: 0.35,
                }}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
