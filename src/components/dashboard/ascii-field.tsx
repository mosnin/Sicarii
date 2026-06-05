"use client";

import { useEffect, useRef } from "react";

/**
 * The CRM's signature: a slow, calm field of ASCII characters that flow like
 * something being assembled. Rendered to canvas for performance; honours
 * prefers-reduced-motion (draws a single static frame).
 *
 * Theme-aware: detects the `dark` class on <html> via MutationObserver and
 * adjusts alpha — subtle texture in light mode, clearly visible in dark mode.
 *
 * Gradient: each character is coloured along a blue→indigo→purple palette
 * interpolated by (x + y) position so the field reads as a flowing multi-hue
 * gradient. Alpha is still tied to the field value for the "assembling" feel.
 */

// Palette stops: baby-blue → blue → indigo → purple
const PALETTE: [number, number, number][] = [
  [90, 176, 232],   // #5AB0E8 — baby blue
  [91, 141, 239],   // #5B8DEF — blue
  [124, 119, 240],  // #7C77F0 — indigo
  [167, 139, 250],  // #A78BFA — purple
];

/** Linearly interpolate two RGB triplets by t ∈ [0,1]. */
function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Sample the palette at position p ∈ [0,1]. */
function samplePalette(p: number): [number, number, number] {
  const scaled = Math.max(0, Math.min(1, p)) * (PALETTE.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(PALETTE.length - 1, lo + 1);
  return lerpColor(PALETTE[lo], PALETTE[hi], scaled - lo);
}

export function AsciiField({
  className,
  speed = 0.14,
  cell = 12,
}: {
  className?: string;
  speed?: number;
  cell?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ramp = " .·:-=+*≡#%@";
    const cw = cell * 0.62; // monospace cell width
    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let t = Math.random() * 100;
    let raf = 0;
    let last = 0;
    let isDark = document.documentElement.classList.contains("dark");

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const field = (x: number, y: number, tt: number) => {
      const cx = cols / 2;
      const cy = rows / 2;
      const v =
        Math.sin(x * 0.18 + tt) +
        Math.sin(y * 0.22 + tt * 0.7) +
        Math.sin((x + y) * 0.09 + tt * 1.1) +
        Math.sin(Math.hypot(x - cx, y - cy) * 0.13 - tt * 1.25);
      return (v + 4) / 8; // ~0..1
    };

    const draw = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = field(x, y, t);
          const idx = Math.max(
            0,
            Math.min(ramp.length - 1, Math.floor(v * (ramp.length - 1)))
          );
          const ch = ramp[idx];
          if (ch === " ") continue;

          // Gradient position: diagonal (x+y) sweep across the palette
          const gradPos = ((x + y) % Math.max(1, cols + rows)) / (cols + rows);
          const [r, g, b] = samplePalette(gradPos);

          // Alpha: light mode uses much lower alpha so it's a subtle texture;
          // dark mode keeps it clearly visible (roughly original strength).
          const baseAlpha = isDark
            ? 0.06 + v * 0.5   // dark: 0.06 → 0.56
            : 0.015 + v * 0.11; // light: 0.015 → 0.125 — very subtle on white

          ctx.fillStyle = `rgba(${r},${g},${b},${baseAlpha.toFixed(3)})`;
          ctx.fillText(ch, x * cw, y * cell);
        }
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${cell}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.textBaseline = "top";
      cols = Math.ceil(rect.width / cw) + 1;
      rows = Math.ceil(rect.height / cell) + 1;
      draw();
    };

    // Theme observer — react to dark/light class changes on <html>
    const themeObserver = new MutationObserver(() => {
      isDark = document.documentElement.classList.contains("dark");
      draw();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    if (!reduce) {
      const loop = (ts: number) => {
        raf = requestAnimationFrame(loop);
        if (ts - last < 33) return; // ~30 fps — smooth but calm
        last = ts;
        t += speed;
        draw();
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObserver.disconnect();
    };
  }, [speed, cell]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
