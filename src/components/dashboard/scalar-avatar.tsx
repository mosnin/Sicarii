"use client";

import { cn } from "@/lib/utils";

/**
 * Scalar brand avatar — a small circle with the "S" wordmark, used next to
 * assistant messages. Keeps all colour references semantic so it works on
 * both light and dark themes.
 */
export function ScalarAvatar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        "border border-primary/30 bg-primary/10 text-primary",
        "font-brand text-[11px] font-semibold leading-none select-none",
        className,
      )}
    >
      S
    </div>
  );
}
