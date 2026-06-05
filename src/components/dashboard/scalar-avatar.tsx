"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Scalar's avatar: the app favicon badge. When `active` (the agent is
 * responding) it breathes and pulses a ring so the reply feels alive.
 */
export function ScalarAvatar({ className, active = false }: { className?: string; active?: boolean }) {
  const reduce = useReducedMotion();
  const animate = active && !reduce;

  return (
    <motion.div
      aria-hidden="true"
      className={cn("relative mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-primary/30", className)}
      animate={animate ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={animate ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
    >
      <Image src="/icon-512.png" alt="" width={28} height={28} className="h-full w-full object-cover" priority />
      {animate && (
        <motion.span
          className="absolute inset-0 rounded-full ring-2 ring-primary/60"
          animate={{ opacity: [0.15, 0.7, 0.15] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </motion.div>
  );
}
