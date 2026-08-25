"use client";

import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";

// The agents Scalar connects to over MCP. Logos are self-hosted and rendered
// monochrome so the wall stays legible in both light and dark mode (several
// marks are dark or solid-colored and would otherwise vanish on one theme).
const agents = [
  { id: "claude", name: "Claude", src: "/agents/claude.png" },
  { id: "openclaw", name: "OpenClaw", src: "/agents/openclaw.svg" },
  { id: "hermes", name: "Hermes", src: "/agents/hermes.webp" },
  { id: "codex", name: "Codex", src: "/agents/codex.png" },
  { id: "manus", name: "Manus", src: "/agents/manus.png" },
  { id: "google", name: "Google ADK", src: "/agents/google.png" },
  { id: "grok", name: "Grok", src: "/agents/grok.png" },
];

export function AgentMarquee() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Integrate with your favorite agents
        </p>
      </div>

      <div className="relative mt-8 h-[72px] w-full overflow-hidden">
        <InfiniteSlider className="flex h-full w-full items-center" duration={40} gap={64}>
          {agents.map((agent) => (
            <div key={agent.id} className="flex w-32 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={agent.src}
                alt={agent.name}
                loading="lazy"
                className="h-7 w-auto opacity-60 transition-opacity duration-300 hover:opacity-100 [filter:brightness(0)] dark:[filter:brightness(0)_invert(1)]"
              />
            </div>
          ))}
        </InfiniteSlider>

        <ProgressiveBlur
          className="pointer-events-none absolute left-0 top-0 h-full w-[120px] sm:w-[200px]"
          direction="left"
          blurIntensity={1}
        />
        <ProgressiveBlur
          className="pointer-events-none absolute right-0 top-0 h-full w-[120px] sm:w-[200px]"
          direction="right"
          blurIntensity={1}
        />
      </div>
    </section>
  );
}
