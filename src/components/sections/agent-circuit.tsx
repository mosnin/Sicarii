"use client";

/**
 * AgentCircuitSection - the system, wired. A CircuitBoard visualization
 * customized to Scalar's actual data flow: discovery and radar feed
 * verification and enrichment, everything lands in the CRM core, and the
 * CRM drives outreach over email and phone. Animated pulses trace the
 * paths agents actually take through the product (MCP in, records out).
 * Used on the homepage and /product/how-it-works.
 */

import { useEffect, useState } from "react";
import useMeasure from "react-use-measure";
import { CircuitBoard } from "@/components/ui/circuit-board";

const NODES = [
  { id: "agent", x: 70, y: 200, label: "Your agent", status: "active" as const, size: "md" as const },
  { id: "discover", x: 240, y: 80, label: "Discover", status: "processing" as const },
  { id: "radar", x: 240, y: 320, label: "Radar", status: "active" as const },
  { id: "verify", x: 420, y: 80, label: "Verify", status: "active" as const },
  { id: "enrich", x: 420, y: 320, label: "Enrich", status: "processing" as const },
  { id: "crm", x: 600, y: 200, label: "CRM", status: "active" as const, size: "lg" as const },
  { id: "email", x: 780, y: 120, label: "Email", status: "active" as const },
  { id: "calls", x: 780, y: 280, label: "Calls", status: "active" as const },
];

const CONNECTIONS = [
  { from: "agent", to: "discover", animated: true },
  { from: "agent", to: "radar", animated: true },
  { from: "discover", to: "verify", animated: true },
  { from: "radar", to: "enrich", animated: true },
  { from: "verify", to: "crm", animated: true },
  { from: "enrich", to: "crm", animated: true },
  { from: "crm", to: "email", animated: true, bidirectional: true },
  { from: "crm", to: "calls", animated: true, bidirectional: true },
];

// Scalar baby blue for traces and pulses; grid stays whisper-quiet.
const BLUE = {
  traceColor: "rgba(90, 176, 232, 0.30)",
  pulseColor: "#5AB0E8",
  nodeColor: "rgba(90, 176, 232, 0.55)",
};

const BOARD_W = 850;
const BOARD_H = 400;

export function AgentCircuit({ className }: { className?: string }) {
  // The board reads theme from the DOM; render after mount to avoid a
  // light/dark mismatch flash during hydration.
  const [mounted, setMounted] = useState(false);
  // Canonical mount-gate pattern (same as dashboard-shell) to avoid a theme
  // mismatch flash during hydration.
  useEffect(() => setMounted(true), []); // eslint-disable-line react-hooks/set-state-in-effect

  // The board positions nodes in fixed pixels, so scale the whole surface to
  // the measured container width instead of overflowing on small screens.
  const [measureRef, bounds] = useMeasure();
  const scale = bounds.width > 0 ? Math.min(bounds.width / BOARD_W, 1) : 1;

  return (
    <div ref={measureRef} className={className} style={{ height: BOARD_H * scale }}>
      {mounted && (
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <CircuitBoard
            nodes={NODES}
            connections={CONNECTIONS}
            width={BOARD_W}
            height={BOARD_H}
            pulseSpeed={2.6}
            traceWidth={2}
            {...BLUE}
          />
        </div>
      )}
    </div>
  );
}

export function AgentCircuitSection() {
  return (
    <section className="relative bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">The system</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            One circuit from prompt to relationship
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Your agent speaks MCP. Discovery and radar feed verification and enrichment,
            every record lands in the CRM, and the CRM drives the outreach.
          </p>
        </div>

        <div className="mx-auto mt-12 w-full max-w-4xl rounded-2xl border border-border bg-card/40 p-3 sm:p-6">
          <AgentCircuit className="w-full overflow-hidden" />
        </div>
      </div>
    </section>
  );
}
