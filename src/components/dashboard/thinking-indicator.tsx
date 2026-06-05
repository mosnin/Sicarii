"use client";

import { motion, useReducedMotion } from "motion/react";
import { ScalarAvatar } from "./scalar-avatar";

/**
 * Animated "Scalar is thinking…" indicator shown while status === "submitted"
 * (before first tokens arrive). Three bouncing dots.
 */
export function ThinkingIndicator() {
  const reduce = useReducedMotion();

  return (
    <div className="flex items-start gap-3 py-1">
      <ScalarAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-muted-foreground"
            animate={
              reduce
                ? {}
                : {
                    y: ["0%", "-50%", "0%"],
                    opacity: [0.4, 1, 0.4],
                  }
            }
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.18,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
