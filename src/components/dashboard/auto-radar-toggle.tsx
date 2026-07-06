"use client";

/**
 * AutoRadarToggle - the visible consent control for the away-window Radar. On by
 * default so The Pulse guarantee holds; turning it off PATCHes /api/settings,
 * which pauses the user's auto-seeded ICP monitor (a real off switch, not a
 * cosmetic preference).
 */

import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function AutoRadarToggle({ initialOn }: { initialOn: boolean }) {
  const [on, setOn] = useState(initialOn);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (saving) return;
    const next = !on;
    setOn(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRadar: next }),
      });
      if (!res.ok) setOn(!next); // revert on failure
    } catch {
      setOn(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Weekly ICP radar</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your agent scans for new matches to your ICP every week, so there&apos;s
          something new when you return. Bounded by your credits; pause anytime.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Toggle weekly ICP radar"
        onClick={toggle}
        disabled={saving}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          on ? "bg-primary" : "bg-muted-foreground/30",
          saving && "opacity-70",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow-sm",
            on ? "ml-[22px]" : "ml-0.5",
          )}
        />
      </button>
    </div>
  );
}
