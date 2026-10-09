"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { AsciiField } from "@/components/dashboard/ascii-field";

// Scalar taglines - one picked at random each mount.
const TAGLINES = [
  "Your agents are already working.",
  "Research, enriched.",
  "Context is everything.",
  "The CRM your agents run.",
  "Quiet leverage, working for you.",
];

const easeOut = "easeOut" as const;

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

  // Pick a random tagline once - lazy initializer avoids impure render calls.
  const [tagline] = useState<string>(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: easeOut }}
        >
          {/* Brand ASCII field, toned down behind the calm loader */}
          <AsciiField
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-[0.2]"
            cell={14}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 40% 35% at 50% 50%, var(--background) 0%, transparent 100%)",
            }}
          />

          <div className="relative z-10 flex flex-col items-center px-6 text-center">
            {/* Small logo */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: easeOut }}
            >
              <Image
                src="/icon-512.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-[8px] border border-border"
                priority
              />
            </motion.div>

            {/* Greeting */}
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: easeOut, delay: 0.1 }}
              className="mt-4 text-base font-medium text-foreground"
            >
              Good to see you{name ? `, ${name}` : ""}
            </motion.p>

            {/* Tagline */}
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: easeOut, delay: 0.2 }}
              className="mt-1 text-sm text-fg-tertiary"
            >
              {tagline}
            </motion.p>

            {/* Thin progress bar that sweeps scaleX 0 to 1 */}
            <motion.div
              className="mt-5 h-0.5 w-32 overflow-hidden rounded-full bg-surface-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.div
                className="h-full w-full rounded-full bg-primary"
                style={{ originX: 0 }}
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
