"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { AsciiField } from "@/components/dashboard/ascii-field";

/**
 * The hero centerpiece: a live, self-driving demo of the CRM building itself.
 * It types an ICP prompt, streams companies in one at a time, fills in
 * enrichment and fit, then senses intent, and cycles through a few prompts. The
 * visitor can click a preset to rebuild it themselves. This is "show, don't
 * tell": the product is working before they sign up. Reduced motion shows the
 * finished board with no animation.
 *
 * The data is generic demo data, plausible and clearly not real customers, so
 * the preview stays honest: this is what your CRM looks like once an agent runs.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

type Intent = "hot" | "warm" | "cool";

type Row = {
  company: string;
  domain: string;
  chips: string[];
  intent: Intent;
  fit: number;
  contacts: number;
};

type Build = {
  label: string;
  prompt: string;
  rows: Row[];
};

const builds: Build[] = [
  {
    label: "Series B fintech",
    prompt: "Series B fintech companies hiring SDRs",
    rows: [
      { company: "Northwind Pay", domain: "northwindpay.com", chips: ["Payments", "180 emp", "Series B"], intent: "hot", fit: 94, contacts: 7 },
      { company: "Ledgerline", domain: "ledgerline.io", chips: ["Fintech infra", "120 emp", "Series B"], intent: "warm", fit: 86, contacts: 5 },
      { company: "Cedar Capital", domain: "cedarcapital.co", chips: ["Lending", "240 emp", "Series B"], intent: "hot", fit: 82, contacts: 6 },
      { company: "Atlas Treasury", domain: "atlastreasury.com", chips: ["Treasury", "90 emp", "Series B"], intent: "cool", fit: 71, contacts: 4 },
    ],
  },
  {
    label: "AI infra in NYC",
    prompt: "AI infrastructure startups based in New York",
    rows: [
      { company: "Meridian Compute", domain: "meridian.ai", chips: ["GPU cloud", "75 emp", "Series A"], intent: "hot", fit: 91, contacts: 5 },
      { company: "Vector Foundry", domain: "vectorfoundry.com", chips: ["Vector DB", "60 emp", "Seed"], intent: "warm", fit: 84, contacts: 4 },
      { company: "Halcyon Labs", domain: "halcyon.dev", chips: ["Inference", "130 emp", "Series B"], intent: "warm", fit: 78, contacts: 6 },
      { company: "Probe AI", domain: "probe.ai", chips: ["Eval tooling", "30 emp", "Seed"], intent: "cool", fit: 69, contacts: 3 },
    ],
  },
  {
    label: "Healthtech, early",
    prompt: "Healthtech companies from Seed to Series A",
    rows: [
      { company: "Cedar Health", domain: "cedarhealth.io", chips: ["Care nav", "85 emp", "Series A"], intent: "hot", fit: 89, contacts: 6 },
      { company: "Vital Loop", domain: "vitalloop.com", chips: ["RPM", "40 emp", "Seed"], intent: "warm", fit: 80, contacts: 4 },
      { company: "Praxis Bio", domain: "praxisbio.co", chips: ["Diagnostics", "55 emp", "Series A"], intent: "warm", fit: 76, contacts: 5 },
      { company: "Northstar Mind", domain: "northstarmind.com", chips: ["Behavioral", "25 emp", "Seed"], intent: "cool", fit: 64, contacts: 2 },
    ],
  },
];

const intentDot: Record<Intent, string> = {
  hot: "bg-success",
  warm: "bg-primary",
  cool: "bg-muted-foreground/40",
};

const intentLabel: Record<Intent, string> = {
  hot: "In-market",
  warm: "Researching",
  cool: "Quiet",
};

export function LiveDemo() {
  const reduce = useReducedMotion();
  const [activeIdx, setActiveIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(0);
  const [enriched, setEnriched] = useState(false);
  const [status, setStatus] = useState("Reading your prompt");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const at = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const runBuild = useCallback(
    (idx: number, autoAdvance: boolean) => {
      clearTimers();
      const build = builds[idx];
      setActiveIdx(idx);
      setTyped("");
      setRevealed(0);
      setEnriched(false);
      setStatus("Reading your prompt");

      // Reduced motion: skip straight to the finished board.
      if (reduce) {
        setTyped(build.prompt);
        setRevealed(build.rows.length);
        setEnriched(true);
        setStatus(`Done. ${build.rows.length} companies, ${totalContacts(build)} contacts`);
        return;
      }

      // 1) Type the prompt.
      const chars = build.prompt.length;
      const typeStep = 26;
      for (let c = 1; c <= chars; c++) {
        at(c * typeStep, () => setTyped(build.prompt.slice(0, c)));
      }
      let t = chars * typeStep + 360;

      // 2) Discover: stream rows one at a time.
      at(t, () => setStatus("Discovering companies"));
      t += 320;
      build.rows.forEach((_, i) => {
        at(t, () => setRevealed(i + 1));
        t += 420;
      });

      // 3) Enrich + sense intent.
      t += 200;
      at(t, () => setStatus("Enriching records"));
      at(t + 120, () => setEnriched(true));
      t += 900;
      at(t, () => setStatus("Sensing intent"));
      t += 850;
      at(t, () => setStatus(`Done. ${build.rows.length} companies, ${totalContacts(build)} contacts`));

      // 4) Hold, then move to the next prompt.
      if (autoAdvance) {
        t += 3200;
        at(t, () => runBuild((idx + 1) % builds.length, true));
      }
    },
    [reduce, clearTimers, at],
  );

  useEffect(() => {
    runBuild(0, true);
    return clearTimers;
    // runBuild and clearTimers are stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const build = builds[activeIdx];

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      {/* soft brand glow under the window */}
      <div className="pointer-events-none absolute -inset-x-6 -bottom-10 top-16 bg-[radial-gradient(ellipse_at_50%_50%,rgba(90,176,232,0.22),transparent_70%)] blur-2xl" />

      <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-2xl shadow-black/10 dark:border-white/10 dark:shadow-black/50">
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

        {/* agent prompt bar with the typing prompt + live status */}
        <div className="relative overflow-hidden border-b border-border bg-muted/40 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08] dark:opacity-[0.10]" cell={12} speed={0.06} gradient />
          <div className="relative z-10 flex items-center gap-2.5">
            <span className="flex h-2 w-2 shrink-0 items-center justify-center">
              <span className="absolute h-2 w-2 animate-ping rounded-full bg-primary/60" />
              <span className="h-2 w-2 rounded-full bg-primary" />
            </span>
            <p className="truncate font-mono text-xs text-foreground/85">
              <span className="text-muted-foreground">scalar </span>
              {typed}
              {!reduce && (
                <motion.span
                  aria-hidden
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.7, repeat: Infinity, repeatType: "reverse" }}
                  className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] bg-primary"
                />
              )}
            </p>
          </div>
          <div className="relative z-10 mt-1.5 flex items-center gap-2 pl-[1.1rem]">
            <AnimatePresence mode="wait">
              <motion.span
                key={status}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="text-[11px] text-muted-foreground"
              >
                {status}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        {/* table */}
        <div className="px-2 py-2 sm:px-3 sm:py-3">
          <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            <div className="col-span-6 sm:col-span-5">Company</div>
            <div className="col-span-2 hidden sm:block">Signal</div>
            <div className="col-span-4 hidden sm:block">Enrichment</div>
            <div className="col-span-6 text-right sm:col-span-1">Fit</div>
          </div>

          {/* Fixed height so the board does not jump as rows stream in. */}
          <div className="min-h-[268px] space-y-1">
            <AnimatePresence mode="popLayout">
              {build.rows.slice(0, revealed).map((row) => (
                <motion.div
                  key={`${build.label}-${row.company}`}
                  layout
                  initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="grid grid-cols-12 items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/50 dark:hover:bg-white/[0.03]"
                >
                  {/* company + domain */}
                  <div className="col-span-6 sm:col-span-5">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${intentDot[row.intent]}`} />
                      <span className="font-brand text-sm text-foreground">{row.company}</span>
                    </div>
                    <p className="mt-0.5 truncate pl-3.5 text-xs text-muted-foreground">{row.domain}</p>
                  </div>

                  {/* signal */}
                  <div className="col-span-2 hidden sm:block">
                    <AnimatePresence>
                      {enriched && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.4 }}
                          className="text-xs text-muted-foreground"
                        >
                          {intentLabel[row.intent]}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* enrichment chips */}
                  <div className="col-span-4 hidden flex-wrap gap-1.5 sm:flex">
                    <AnimatePresence>
                      {enriched &&
                        row.chips.map((chip, ci) => (
                          <motion.span
                            key={chip}
                            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3, delay: ci * 0.06, ease: EASE }}
                            className="rounded-md border border-border bg-background/60 px-2 py-0.5 text-[11px] text-foreground/70 dark:border-white/10 dark:bg-white/[0.03]"
                          >
                            {chip}
                          </motion.span>
                        ))}
                    </AnimatePresence>
                  </div>

                  {/* fit */}
                  <div className="col-span-6 flex items-center justify-end gap-2 sm:col-span-1">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted sm:w-10">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={reduce ? false : { width: 0 }}
                        animate={{ width: enriched ? `${row.fit}%` : 0 }}
                        transition={{ duration: 0.7, ease: EASE }}
                      />
                    </div>
                    <span className="w-6 text-right font-brand text-xs tabular-nums text-foreground">
                      {enriched ? row.fit : ""}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Interactive preset prompts: click to rebuild the board yourself. */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-muted-foreground">Try a prompt:</span>
        {builds.map((b, i) => (
          <button
            key={b.label}
            type="button"
            onClick={() => runBuild(i, false)}
            aria-pressed={i === activeIdx}
            className={
              i === activeIdx
                ? "rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors"
                : "rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            }
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function totalContacts(build: Build): number {
  return build.rows.reduce((sum, r) => sum + r.contacts, 0);
}
