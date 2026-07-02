import { cn } from "@/lib/utils";

/**
 * Corner tick marks: a blueprint-style frame drawn only at the four corners.
 * Render inside any `relative` container; it overlays without capturing
 * pointer events. Adapted from the pixel-perfect registry to take a className
 * and use theme tokens.
 */
const Border2 = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
    <span className="absolute -top-0 -left-[0.5px] block size-6 border-t border-l border-muted-foreground/60 z-30" />
    <span className="absolute -top-px -right-px block size-6 border-t border-r border-muted-foreground/60 z-30" />
    <span className="absolute -bottom-px -left-[0.5px] block size-6 border-b border-l border-muted-foreground/60 z-30" />
    <span className="absolute -bottom-px -right-px block size-6 border-b border-r border-muted-foreground/60 z-30" />
  </div>
);

export default Border2;
