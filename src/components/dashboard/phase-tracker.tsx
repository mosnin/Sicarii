"use client";

import { cn } from "@/lib/utils";
import { Check, Circle, Loader2 } from "lucide-react";
import { motion } from "motion/react";

export interface Phase {
  id: string;
  name: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
  order: number;
}

interface PhaseTrackerProps {
  phases: Phase[];
  className?: string;
}

export function PhaseTracker({ phases, className }: PhaseTrackerProps) {
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

  return (
    <div className={cn("space-y-0", className)}>
      {sortedPhases.map((phase, index) => {
        const isLast = index === sortedPhases.length - 1;
        const isCompleted = phase.status === "completed";
        const isActive = phase.status === "in_progress";
        const isPending = phase.status === "pending";

        return (
          <motion.div
            key={phase.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex gap-4"
          >
            {/* Timeline column */}
            <div className="flex flex-col items-center">
              {/* Status icon */}
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  isCompleted &&
                    "border-orange bg-orange text-white",
                  isActive &&
                    "border-orange bg-orange/10 text-orange animate-pulse-glow",
                  isPending &&
                    "border-border bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : isActive ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-[40px]",
                    isCompleted ? "bg-orange" : "bg-border"
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div className={cn("pb-8", isLast && "pb-0")}>
              <div className="flex items-center gap-2">
                <h4
                  className={cn(
                    "font-semibold",
                    isActive && "text-orange",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {phase.name}
                </h4>
                {isActive && (
                  <span className="inline-flex items-center rounded-full bg-orange/10 px-2 py-0.5 text-xs font-medium text-orange">
                    In Progress
                  </span>
                )}
                {isCompleted && (
                  <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    Completed
                  </span>
                )}
              </div>
              {phase.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {phase.description}
                </p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* Horizontal version for compact displays */
export function PhaseTrackerHorizontal({ phases, className }: PhaseTrackerProps) {
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

  return (
    <div className={cn("flex items-center justify-between", className)}>
      {sortedPhases.map((phase, index) => {
        const isLast = index === sortedPhases.length - 1;
        const isCompleted = phase.status === "completed";
        const isActive = phase.status === "in_progress";

        return (
          <div key={phase.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center text-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold",
                  isCompleted && "border-orange bg-orange text-white",
                  isActive && "border-orange bg-orange/10 text-orange",
                  !isCompleted && !isActive && "border-border text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  "mt-1 text-xs",
                  isActive ? "text-orange font-medium" : "text-muted-foreground"
                )}
              >
                {phase.name}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "mx-1 h-0.5 flex-1",
                  isCompleted ? "bg-orange" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
