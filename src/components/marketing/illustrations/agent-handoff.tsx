"use client";

/**
 * Bring your own agent - Forge UI `handoffmenu`, adapted.
 *
 * Vendor layout, spacing and scale-to-fit kept. The stock menu hands off to
 * Cursor, Zed and Opencode through `react-icons/si`; Scalar connects to none
 * of them, and every mark on a list like this is a promise. So the rows are
 * the seven MCP clients `agent-marquee` already ships, drawn from our own
 * monochrome assets in `public/agents` rather than importing a second icon
 * family. Seven rows need more canvas than the vendor's five, and the fades
 * are gone because the connected row is the payoff and was sitting under one.
 */

import React from "react";

import { FitScale } from "./fit-scale";

type Tool = {
  label: string;
  src: string;
};

const TOOLS: Tool[] = [
  { label: "Claude, connected as you", src: "/agents/claude.png" },
  { label: "Connect OpenClaw", src: "/agents/openclaw.svg" },
  { label: "Connect Hermes", src: "/agents/hermes.webp" },
  { label: "Connect Codex", src: "/agents/codex.png" },
  { label: "Connect Manus", src: "/agents/manus.png" },
  { label: "Connect Google ADK", src: "/agents/google.png" },
  { label: "Connect Grok", src: "/agents/grok.png" },
];

export function AgentHandoff() {
  return (
    <FitScale width={400} height={372}>
      <div className="relative h-full w-full">
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2.5">
          {TOOLS.map((t) => (
            <div
              key={t.label}
              className="flex h-11 w-[330px] items-center gap-3 rounded-xl border border-border bg-muted/50 px-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.src}
                alt=""
                loading="lazy"
                className="h-4 w-auto shrink-0 opacity-70 [filter:brightness(0)] dark:[filter:brightness(0)_invert(1)]"
              />
              <span className="whitespace-nowrap text-[14px] text-foreground">
                {t.label}
              </span>
            </div>
          ))}
        </div>

      </div>
    </FitScale>
  );
};

