import { cn } from "@/lib/utils";

/**
 * A radial glow that fades from transparent through the primary hue into the
 * page background. Adapted from the pixel-perfect registry to use theme
 * tokens (primary + background) so it holds in light and dark mode.
 */
export default function GradientGlowFade({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 [background:radial-gradient(125%_125%_at_50%_0%,transparent_40%,color-mix(in_oklab,var(--primary)_35%,transparent),var(--background)_100%)]",
        className,
      )}
    />
  );
}
