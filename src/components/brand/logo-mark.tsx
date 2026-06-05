import { cn } from "@/lib/utils";

/**
 * The Scalar wordmark: [s] — brackets in the foreground tone (so they flip
 * black-on-light / white-on-dark with the theme) and the "s" in brand baby
 * blue. Size/weight come from `className` (defaults are sensible).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-label="Scalar"
      className={cn(
        "font-brand select-none font-bold leading-none tracking-tight",
        className
      )}
    >
      <span className="text-foreground/45">[</span>
      <span className="text-primary">s</span>
      <span className="text-foreground/45">]</span>
    </span>
  );
}
