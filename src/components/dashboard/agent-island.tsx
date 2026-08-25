"use client";

/**
 * AgentIsland - the ambient status HUD, built on the DynamicIsland motion
 * surface (see DESIGN.md, Motion Surfaces). Floats top-center over the
 * dashboard like a hardware status island: collapsed it whispers the credit
 * meter; tapped, it springs open to the plan, meter, and live radar count.
 * Quiet leverage: the product state is always one glance away, never a page.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DynamicIsland,
  DynamicIslandProvider,
  DynamicContainer,
  useDynamicIslandSize,
} from "@/components/ui/dynamic-island";

function formatCredits(n: number): string {
  return n.toLocaleString("en-US");
}

function IslandBody({
  credits,
  plan,
  radarActive,
}: {
  credits: number;
  plan: string;
  radarActive: number;
}) {
  const { state, setSize } = useDynamicIslandSize();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-tuck after a glance; a HUD should never demand attention.
  useEffect(() => {
    if (open) {
      timerRef.current = setTimeout(() => {
        setSize("compact");
        setOpen(false);
      }, 8000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, setSize]);

  function toggle() {
    if (open) {
      setSize("compact");
      setOpen(false);
    } else {
      setSize("long");
      setOpen(true);
    }
  }

  return (
    // A div with button semantics rather than <button>: the expanded state
    // nests a Link, and an anchor inside a button is invalid HTML.
    <div
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      aria-label={open ? "Collapse status" : "Expand status"}
      aria-expanded={open}
      className="block h-full w-full cursor-pointer select-none focus-visible:outline-none"
    >
      {state.size === "compact" ? (
        <DynamicContainer className="flex h-full w-full items-center justify-center gap-2 px-4">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-sm font-medium tabular-nums text-foreground">
            {formatCredits(credits)} credits
          </span>
        </DynamicContainer>
      ) : (
        <DynamicContainer className="flex h-full w-full items-center justify-between gap-4 px-6">
          <div className="flex flex-col items-start">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {plan} plan
            </span>
            <span className="font-brand text-lg tabular-nums text-foreground">
              {formatCredits(credits)} credits
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              {radarActive} radar{radarActive === 1 ? "" : "s"} live
            </span>
            <Link
              href="/settings"
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-primary hover:underline"
            >
              Manage
            </Link>
          </div>
        </DynamicContainer>
      )}
    </div>
  );
}

export function AgentIsland({
  credits,
  plan,
  radarActive,
}: {
  credits: number;
  plan: string;
  radarActive: number;
}) {
  return (
    // Tucked into the bottom-right corner, out of the way of the header and the
    // bottom-center nav dock. Light glassy card shell (not the black default) so
    // it reads as ambient chrome, never an obstruction.
    <div className="pointer-events-none fixed bottom-6 right-4 z-40 hidden md:block">
      <div className="pointer-events-auto">
        <DynamicIslandProvider initialSize="compact">
          <DynamicIsland
            id="agent-island"
            className="border-border bg-card/95 text-foreground shadow-lg shadow-black/5 backdrop-blur-xl dark:bg-card/90"
          >
            <IslandBody credits={credits} plan={plan} radarActive={radarActive} />
          </DynamicIsland>
        </DynamicIslandProvider>
      </div>
    </div>
  );
}
