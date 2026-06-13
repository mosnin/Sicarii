"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

/**
 * The interactive heart of the homepage: a segmented showcase of what an agent
 * does inside Scalar. Selecting a capability swaps a bespoke, animated mini-UI
 * that demonstrates it rather than describing it. It auto-advances and pauses
 * the moment the visitor takes over. Reduced motion shows the first panel
 * static, still selectable.
 */

const EASE = [0.16, 1, 0.3, 1] as const;
const AUTO_MS = 5200;

type Cap = {
  id: string;
  label: string;
  title: string;
  body: string;
};

const caps: Cap[] = [
  {
    id: "discover",
    label: "Discover",
    title: "Find the right companies, from a sentence",
    body: "Describe who you sell to. The agent searches, dedupes, and returns real companies as typed records, never aggregators or the wrong match.",
  },
  {
    id: "enrich",
    label: "Enrich",
    title: "Every field filled, the moment it runs",
    body: "Firmographics, funding, verified email and mobile, tech stack, and recent news land as real fields you can sort, filter, and trust, each tagged with where it came from.",
  },
  {
    id: "intent",
    label: "Sense intent",
    title: "See who is in-market before anyone else",
    body: "Buying signals are read continuously and scored, so your agent reaches the accounts that are looking right now, not the ones that went cold last quarter.",
  },
  {
    id: "connect",
    label: "Connect",
    title: "Bring your own agent over MCP",
    body: "OpenClaw, Hermes, Claude, anything that speaks MCP connects in a click and gets a real database with typed tools, not a folder of markdown files.",
  },
];

/* ------------------------------- Panels ----------------------------------- */

const panelContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};
const panelItem = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: EASE } },
};

function PanelFrame({ children, reduce }: { children: React.ReactNode; reduce: boolean | null }) {
  return (
    <motion.div
      variants={reduce ? undefined : panelContainer}
      initial={reduce ? false : "hidden"}
      animate="show"
      className="flex h-full flex-col gap-2"
    >
      {children}
    </motion.div>
  );
}

function DiscoverPanel({ reduce }: { reduce: boolean | null }) {
  const found = [
    { name: "Northwind Pay", domain: "northwindpay.com" },
    { name: "Ledgerline", domain: "ledgerline.io" },
    { name: "Cedar Capital", domain: "cedarcapital.co" },
    { name: "Atlas Treasury", domain: "atlastreasury.com" },
  ];
  return (
    <PanelFrame reduce={reduce}>
      <motion.div variants={panelItem} className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5 font-mono text-xs text-foreground/80 dark:border-white/10 dark:bg-white/[0.03]">
        <span className="text-muted-foreground">search</span>
        Series B fintech in New York
      </motion.div>
      <motion.p variants={panelItem} className="px-1 text-[11px] text-muted-foreground">
        6 companies found, 4 shown
      </motion.p>
      <div className="space-y-1.5">
        {found.map((f) => (
          <motion.div
            key={f.name}
            variants={panelItem}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 dark:border-white/10"
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="font-brand text-sm text-foreground">{f.name}</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">{f.domain}</span>
          </motion.div>
        ))}
      </div>
    </PanelFrame>
  );
}

function EnrichPanel({ reduce }: { reduce: boolean | null }) {
  const fields = [
    { k: "Industry", v: "Payments", src: "Explorium" },
    { k: "Size", v: "180 employees", src: "Explorium" },
    { k: "Funding", v: "Series B, $40M", src: "Exa" },
    { k: "Email", v: "ava@northwindpay.com", src: "Pipe0" },
    { k: "Mobile", v: "+1 (212) 555 0142", src: "Pipe0" },
  ];
  return (
    <PanelFrame reduce={reduce}>
      <motion.div variants={panelItem} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 dark:border-white/10">
        <span className="font-brand text-sm text-foreground">Northwind Pay</span>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">Enriched</span>
      </motion.div>
      <div className="space-y-1">
        {fields.map((f) => (
          <motion.div key={f.k} variants={panelItem} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.03]">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{f.k}</span>
            <span className="flex-1 truncate text-sm text-foreground">{f.v}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">via {f.src}</span>
          </motion.div>
        ))}
      </div>
    </PanelFrame>
  );
}

function IntentPanel({ reduce }: { reduce: boolean | null }) {
  const signals = [
    { name: "Northwind Pay", score: 94, label: "In-market", tone: "bg-success" },
    { name: "Cedar Capital", score: 82, label: "In-market", tone: "bg-success" },
    { name: "Ledgerline", score: 67, label: "Researching", tone: "bg-primary" },
    { name: "Atlas Treasury", score: 38, label: "Quiet", tone: "bg-muted-foreground/40" },
  ];
  return (
    <PanelFrame reduce={reduce}>
      {signals.map((s) => (
        <motion.div key={s.name} variants={panelItem} className="rounded-xl border border-border bg-card px-3 py-3 dark:border-white/10">
          <div className="flex items-center justify-between">
            <span className="font-brand text-sm text-foreground">{s.name}</span>
            <span className="text-[11px] text-muted-foreground">{s.label}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={`h-full rounded-full ${s.tone}`}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${s.score}%` }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
              />
            </div>
            <span className="w-6 text-right font-brand text-xs tabular-nums text-foreground">{s.score}</span>
          </div>
        </motion.div>
      ))}
    </PanelFrame>
  );
}

function ConnectPanel({ reduce }: { reduce: boolean | null }) {
  const lines = [
    { t: "connecting agent over mcp", muted: true },
    { t: "authenticated as you", muted: true },
    { t: "12 typed tools available", muted: false },
  ];
  const tools = ["list_entities", "create_contact", "enrich_entity", "search_intent", "add_note", "export_csv"];
  return (
    <PanelFrame reduce={reduce}>
      <div className="space-y-1 rounded-xl border border-border bg-background/60 p-3 font-mono text-xs dark:border-white/10 dark:bg-white/[0.03]">
        {lines.map((l) => (
          <motion.p key={l.t} variants={panelItem} className={l.muted ? "text-muted-foreground" : "text-foreground"}>
            <span className="text-primary">{"> "}</span>
            {l.t}
          </motion.p>
        ))}
        <motion.p variants={panelItem} className="flex items-center gap-1.5 pt-1 text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          connected
        </motion.p>
      </div>
      <motion.p variants={panelItem} className="px-1 pt-1 text-[11px] text-muted-foreground">
        Your agent can now read and write every record
      </motion.p>
      <div className="grid grid-cols-2 gap-1.5">
        {tools.map((t) => (
          <motion.span key={t} variants={panelItem} className="rounded-lg border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground/75 dark:border-white/10">
            {t}
          </motion.span>
        ))}
      </div>
    </PanelFrame>
  );
}

function Panel({ id, reduce }: { id: string; reduce: boolean | null }) {
  if (id === "discover") return <DiscoverPanel reduce={reduce} />;
  if (id === "enrich") return <EnrichPanel reduce={reduce} />;
  if (id === "intent") return <IntentPanel reduce={reduce} />;
  return <ConnectPanel reduce={reduce} />;
}

/* ------------------------------- Section ---------------------------------- */

export function CapabilitiesSection() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (reduce || paused) {
      stop();
      return;
    }
    timer.current = setInterval(() => setActive((a) => (a + 1) % caps.length), AUTO_MS);
    return stop;
  }, [reduce, paused, stop]);

  const select = useCallback((i: number) => {
    setActive(i);
    setPaused(true);
  }, []);

  const cap = caps[active];

  return (
    <section
      id="capabilities"
      className="relative scroll-mt-24 bg-muted/30 py-24 dark:bg-background sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Capabilities</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            What your agent <span className="text-gradient-orange">actually does</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Discovery, enrichment, intent, and memory as first-class tools.
            Operated by your agent, observed by you, on data that stays yours.
          </p>
        </div>

        <div
          className="mt-14 overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl shadow-black/[0.04] dark:border-white/10 dark:shadow-black/40"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="grid lg:grid-cols-[minmax(0,300px)_1fr]">
            {/* Segmented control */}
            <div className="flex gap-2 overflow-x-auto border-b border-border p-4 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:border-b-0 lg:border-r dark:border-white/10">
              {caps.map((c, i) => {
                const on = i === active;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => select(i)}
                    aria-pressed={on}
                    className={
                      "group relative shrink-0 rounded-2xl px-4 py-3 text-left transition-colors lg:shrink " +
                      (on ? "bg-primary/10" : "hover:bg-muted/60 dark:hover:bg-white/[0.03]")
                    }
                  >
                    <span className={"font-brand text-sm " + (on ? "text-primary" : "text-foreground")}>
                      {c.label}
                    </span>
                    {/* auto-advance progress, desktop only */}
                    {on && !reduce && !paused && (
                      <motion.span
                        key={`p-${active}`}
                        className="absolute bottom-1.5 left-4 right-4 hidden h-0.5 origin-left rounded-full bg-primary/50 lg:block"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: AUTO_MS / 1000, ease: "linear" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Copy + animated panel */}
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-2 lg:items-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`copy-${cap.id}`}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  <h3 className="font-brand text-xl text-foreground sm:text-2xl">{cap.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{cap.body}</p>
                </motion.div>
              </AnimatePresence>

              <div className="relative min-h-[300px] rounded-2xl border border-border bg-muted/30 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`panel-${cap.id}`}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="h-full"
                  >
                    <Panel id={cap.id} reduce={reduce} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
