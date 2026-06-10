"use client";

import { motion } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";

/**
 * A faithful, in-browser mock of the Scalar CRM, built from the real design
 * tokens (no screenshot, no placeholder). It is the "show, don't tell" anchor of
 * the logged-out page: a visitor sees the product working before they sign up.
 *
 * The data is generic demo data (plausible, clearly not real customers) so the
 * preview is honest: this is what your CRM looks like once an agent has run, not
 * a claim about who uses us.
 */

const easeOut = [0.16, 1, 0.3, 1] as const;

type Row = {
  company: string;
  domain: string;
  chips: string[];
  intent: "hot" | "warm" | "cool";
  fit: number; // 0..100
};

const rows: Row[] = [
  { company: "Northwind Labs", domain: "northwind.ai", chips: ["AI infra", "120 emp", "Series B"], intent: "hot", fit: 94 },
  { company: "Meridian Robotics", domain: "meridian.co", chips: ["Robotics", "340 emp", "Series C"], intent: "warm", fit: 81 },
  { company: "Atlas Freight", domain: "atlasfreight.com", chips: ["Logistics", "1.2k emp", "Public"], intent: "cool", fit: 67 },
  { company: "Cedar Health", domain: "cedarhealth.io", chips: ["Healthtech", "85 emp", "Seed"], intent: "warm", fit: 73 },
];

const intentDot: Record<Row["intent"], string> = {
  hot: "bg-success",
  warm: "bg-primary",
  cool: "bg-muted-foreground/40",
};

const intentLabel: Record<Row["intent"], string> = {
  hot: "In-market",
  warm: "Researching",
  cool: "Quiet",
};

export function ProductMock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, ease: easeOut }}
      className="relative mx-auto w-full max-w-5xl"
    >
      {/* soft brand glow under the window */}
      <div className="pointer-events-none absolute -inset-x-8 -bottom-8 top-10 bg-[radial-gradient(ellipse_at_50%_50%,rgba(90,176,232,0.18),transparent_70%)] blur-2xl" />

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 dark:border-white/10 dark:shadow-black/50">
        {/* window chrome */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 dark:border-white/10">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-muted-foreground/25" />
            <span className="h-3 w-3 rounded-full bg-muted-foreground/25" />
            <span className="h-3 w-3 rounded-full bg-muted-foreground/25" />
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] text-muted-foreground dark:border-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            app.tryscalar.xyz / crm
          </div>
        </div>

        {/* agent activity strip */}
        <div className="relative flex items-center gap-3 overflow-hidden border-b border-border bg-muted/40 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08] dark:opacity-[0.10]" cell={12} speed={0.06} gradient />
          <span className="relative z-10 flex h-2 w-2 shrink-0 items-center justify-center">
            <span className="absolute h-2 w-2 animate-ping rounded-full bg-primary/60" />
            <span className="h-2 w-2 rounded-full bg-primary" />
          </span>
          <p className="relative z-10 text-xs text-foreground/80">
            <span className="font-brand text-foreground">Scalar</span> enriched 12 companies and
            found 31 verified contacts
            <span className="text-muted-foreground"> · just now</span>
          </p>
        </div>

        {/* table */}
        <div className="px-2 py-2 sm:px-3 sm:py-3">
          {/* header row */}
          <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            <div className="col-span-5">Company</div>
            <div className="col-span-2 hidden sm:block">Signal</div>
            <div className="col-span-5 hidden sm:block">Enrichment</div>
            <div className="col-span-7 text-right sm:hidden">Fit</div>
          </div>

          <div className="space-y-1">
            {rows.map((row, i) => (
              <motion.div
                key={row.company}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.2 + i * 0.1, ease: easeOut }}
                className="grid grid-cols-12 items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/50 dark:hover:bg-white/[0.03]"
              >
                {/* company + domain */}
                <div className="col-span-7 sm:col-span-5">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${intentDot[row.intent]}`} />
                    <span className="font-brand text-sm text-foreground">{row.company}</span>
                  </div>
                  <p className="mt-0.5 pl-3.5 text-xs text-muted-foreground">{row.domain}</p>
                </div>

                {/* signal */}
                <div className="col-span-2 hidden sm:block">
                  <span className="text-xs text-muted-foreground">{intentLabel[row.intent]}</span>
                </div>

                {/* enrichment chips */}
                <div className="col-span-5 hidden flex-wrap gap-1.5 sm:flex">
                  {row.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-md border border-border bg-background/60 px-2 py-0.5 text-[11px] text-foreground/70 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                {/* fit score (mobile-visible) */}
                <div className="col-span-5 flex items-center justify-end gap-2 sm:hidden">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${row.fit}%` }} />
                  </div>
                  <span className="font-brand text-xs tabular-nums text-foreground">{row.fit}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
