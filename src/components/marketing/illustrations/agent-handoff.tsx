"use client";

import { FitScale } from "./fit-scale";

/**
 * Bring your own agent, adapted from Forge UI `handoffmenu`.
 *
 * The stock menu hands off to Opencode, Cursor and Zed — editors Scalar does
 * not connect to. Every mark on this list is a promise, so the list is exactly
 * the MCP clients `agent-marquee` already ships, drawn from the same
 * self-hosted, monochrome assets rather than a third-party icon pack. Scalar's
 * icon library is Lucide; brand marks are the one thing it cannot supply, and
 * we answer that with our own files, not by importing a second icon family.
 */

type Client = { id: string; name: string; src: string; connected?: boolean };

const CLIENTS: Client[] = [
  { id: "claude", name: "Claude", src: "/agents/claude.png", connected: true },
  { id: "openclaw", name: "OpenClaw", src: "/agents/openclaw.svg" },
  { id: "hermes", name: "Hermes", src: "/agents/hermes.webp" },
  { id: "codex", name: "Codex", src: "/agents/codex.png" },
  { id: "manus", name: "Manus", src: "/agents/manus.png" },
  { id: "google", name: "Google ADK", src: "/agents/google.png" },
  { id: "grok", name: "Grok", src: "/agents/grok.png" },
];

export function AgentHandoff() {
  return (
    <FitScale width={470} height={372}>
      <div className="relative h-full w-full">
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2">
          {CLIENTS.map((c) => (
            <div
              key={c.id}
              className={`flex h-11 w-[380px] items-center gap-3 rounded-xl border px-4 ${
                c.connected
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-muted/50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.src}
                alt=""
                loading="lazy"
                className="h-4 w-auto shrink-0 opacity-70 [filter:brightness(0)] dark:[filter:brightness(0)_invert(1)]"
              />
              <span className="whitespace-nowrap text-[13.5px] text-foreground">
                {c.connected ? c.name : `Connect ${c.name}`}
              </span>
              {c.connected ? (
                <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  connected as you
                </span>
              ) : null}
            </div>
          ))}
        </div>

      </div>
    </FitScale>
  );
}
