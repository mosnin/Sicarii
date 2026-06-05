"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { DotLoader } from "@/components/ui/dot-loader";

export type DotFlowProps = {
  items: {
    title: string;
    frames: number[][];
    duration?: number;
    repeatCount?: number;
  }[];
  /** Optional styling hooks so the loader can theme into different surfaces. */
  className?: string;
  dotClassName?: string;
  textClassName?: string;
};

const easeOut = [0.16, 1, 0.3, 1] as const;

export const DotFlow = ({
  items,
  className,
  dotClassName,
  textClassName,
}: DotFlowProps) => {
  const [index, setIndex] = useState(0);
  const [textIndex, setTextIndex] = useState(0);

  const next = () => {
    setTextIndex((prev) => (prev + 1) % items.length);
    setIndex((prev) => (prev + 1) % items.length);
  };

  return (
    <div className={cn("flex items-center gap-4 rounded bg-black px-4 py-3", className)}>
      <DotLoader
        frames={items[index].frames}
        onComplete={next}
        className="gap-px"
        repeatCount={items[index].repeatCount ?? 1}
        duration={items[index].duration ?? 150}
        dotClassName={cn("bg-white/15 [&.active]:bg-white size-1", dotClassName)}
      />
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={textIndex}
            initial={{ y: -20, opacity: 0, filter: "blur(4px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: 20, opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.5, ease: easeOut }}
            className={cn(
              "inline-block text-lg font-medium whitespace-nowrap text-white",
              textClassName
            )}
          >
            {items[textIndex].title}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
