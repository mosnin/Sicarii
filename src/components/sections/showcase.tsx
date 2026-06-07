"use client";

import { motion } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";

const easeOut = [0.16, 1, 0.3, 1] as const;

// PLACEHOLDER SCREENS. Swap each `image` for a real product screenshot under
// /public (e.g. /shots/dashboard.png) and render it inside the frame. Until
// then we show a labelled ASCII-textured frame so the layout is final and the
// page never ships a broken image.
const screens = [
  {
    label: "Dashboard",
    caption: "Your CRM at a glance - records, enrichment, and live radar signals.",
    image: null as string | null,
    span: "lg:col-span-2",
  },
  {
    label: "The agent",
    caption: "Chat that has hands: it discovers, enriches, and writes the same CRM you do.",
    image: null as string | null,
    span: "",
  },
  {
    label: "Company record",
    caption: "Firmographics, tech stack, funding, and people - deduped and trustworthy.",
    image: null as string | null,
    span: "",
  },
  {
    label: "Connect your agent (MCP)",
    caption: "Point any agent at Scalar over MCP and it operates the CRM directly.",
    image: null as string | null,
    span: "lg:col-span-2",
  },
];

function ScreenFrame({
  label,
  caption,
  image,
}: {
  label: string;
  caption: string;
  image: string | null;
}) {
  return (
    <div className="group relative h-full overflow-hidden rounded-3xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={label} className="h-full w-full object-cover" />
        ) : (
          <>
            <AsciiField className="absolute inset-0 h-full w-full opacity-[0.14] dark:opacity-[0.12]" cell={13} speed={0.07} gradient />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(90,176,232,0.10),transparent_60%)]" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-brand text-lg text-foreground/70">{label}</span>
              <span className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground/70">
                Preview
              </span>
            </div>
          </>
        )}
      </div>
      <div className="border-t border-border/70 p-5 dark:border-white/10">
        <p className="font-brand text-sm text-foreground">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
      </div>
    </div>
  );
}

export function ShowcaseSection() {
  return (
    <section className="relative scroll-mt-24 bg-muted/30 py-24 dark:bg-background sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-orange/80">See it</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            A real CRM, <span className="text-gradient-orange">run by your agent</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Not another markdown folder. A structured database with a real
            interface, and an agent that operates it for you.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {screens.map((screen, index) => (
            <motion.div
              key={screen.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08, ease: easeOut }}
              className={screen.span}
            >
              <ScreenFrame label={screen.label} caption={screen.caption} image={screen.image} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
