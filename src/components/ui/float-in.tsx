"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

interface FloatInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/**
 * Lightweight motion wrapper that fades + translates children up on mount.
 * Respects prefers-reduced-motion: when active, skips the animation entirely.
 */
export function FloatIn({ children, delay = 0, className }: FloatInProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}
