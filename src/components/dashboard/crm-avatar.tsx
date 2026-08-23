"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Renders a scraped company logo or contact photo with a graceful initial
// fallback. Plain <img> (arbitrary remote hosts), never throws.
export function CrmAvatar({
  src,
  label,
  shape = "circle",
  size = 40,
  className,
}: {
  src?: string | null;
  label?: string | null;
  shape?: "circle" | "square";
  size?: number;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  const radius = shape === "circle" ? "rounded-full" : "rounded-lg";
  const initial = (label?.trim()?.[0] ?? "?").toUpperCase();
  const dims = { width: size, height: size };

  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setErr(true)}
        style={dims}
        className={cn("shrink-0 border border-border bg-muted object-contain", radius, className)}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={dims}
      className={cn(
        "flex shrink-0 items-center justify-center border border-border bg-primary/10 font-brand text-sm text-primary",
        radius,
        className
      )}
    >
      {initial}
    </div>
  );
}
