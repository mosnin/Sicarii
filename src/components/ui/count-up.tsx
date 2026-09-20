"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useTransform, animate, useReducedMotion } from "motion/react";
import { motion } from "motion/react";

interface CountUpProps {
  value: number;
  duration?: number;
  className?: string;
}

/**
 * Animated number count-up. Tweens from 0 → value on mount using motion/react.
 * Respects prefers-reduced-motion: shows the final value immediately when active.
 */
export function CountUp({ value, duration = 1.4, className }: CountUpProps) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(reduce ? value : 0);
  const rounded = useTransform(motionValue, (v) => Math.round(v).toLocaleString());
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (reduce || hasAnimated.current) return;
    hasAnimated.current = true;
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, duration, motionValue, reduce]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
