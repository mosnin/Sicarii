"use client";

import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo-mark";

/**
 * Scalar brand avatar: the lambda logo in a soft circle, shown next to assistant
 * messages. Colours stay semantic so it works on both light and dark themes.
 */
export function ScalarAvatar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        "border border-primary/30 bg-primary/10 select-none",
        className,
      )}
    >
      <LogoMark className="h-4 w-4" />
    </div>
  );
}
