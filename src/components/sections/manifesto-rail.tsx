"use client";

/**
 * ManifestoRail - a SidePanel motion surface (see DESIGN.md, Motion Surfaces)
 * pinned to the page's left edge. Collapsed it is a quiet spine labeled with
 * the toggle; opened, it stretches across the page and speaks the manifesto's
 * core belief with a path to the full page. A moment of conviction between
 * the about section and the closing CTA.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SidePanel } from "@/components/ui/side-panel";

export function ManifestoRail() {
  const [open, setOpen] = useState(false);

  return (
    <section aria-label="The manifesto" className="py-10 sm:py-14">
      <SidePanel
        panelOpen={open}
        handlePanelOpen={() => setOpen((v) => !v)}
        className="bg-card"
        renderButton={(toggle) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex h-8 items-center gap-2 rounded-[4px] px-3 text-sm font-medium text-foreground transition-colors hover:bg-hover"
          >
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span>{open ? "Close" : "Why we built this"}</span>
          </button>
        )}
      >
        <div className="px-6 pb-8 pt-2 md:px-10">
          <p className="max-w-3xl text-xl font-medium leading-snug text-foreground sm:text-2xl">
            We do not think memory is a feature you bolt on. It is the product.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg-secondary sm:text-base">
            A structured place where every record is typed, deduped, and yours, with a
            real interface a human can see and an agent can operate over the same
            surface. So your data compounds instead of rotting, and the leverage stays
            quiet: already working for you.
          </p>
          <Link
            href="/manifesto"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Read the manifesto
            <ArrowRight className="h-4 w-4" strokeWidth={1.6} />
          </Link>
        </div>
      </SidePanel>
    </section>
  );
}
