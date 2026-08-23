"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, Copy } from "lucide-react";

/**
 * The interactive heart of the integrations page: choose your MCP client, copy
 * the connection config, and watch the handshake reveal the typed tools your
 * agent gets. It plays once on view and can be replayed. Reduced motion shows
 * the connected state immediately.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

type Client = {
  id: string;
  label: string;
  snippet: string;
  lang: string;
};

const ENDPOINT = "https://app.tryscalar.xyz/api/mcp";

const clients: Client[] = [
  {
    id: "claude",
    label: "Claude",
    lang: "json",
    snippet: `{
  "mcpServers": {
    "scalar": {
      "url": "${ENDPOINT}",
      "headers": {
        "Authorization": "Bearer scl_your_key"
      }
    }
  }
}`,
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    lang: "toml",
    snippet: `[mcp.scalar]
url = "${ENDPOINT}"
auth = "Bearer scl_your_key"`,
  },
  {
    id: "curl",
    label: "Any MCP / curl",
    lang: "bash",
    snippet: `curl ${ENDPOINT} \\
  -H "Authorization: Bearer scl_your_key"`,
  },
];

const handshake = [
  { t: "connecting agent over mcp", tone: "muted" as const },
  { t: "authenticated as you", tone: "muted" as const },
  { t: "scoped to your data only", tone: "muted" as const },
  { t: "12 typed tools available", tone: "plain" as const },
];

const tools = [
  "list_entities",
  "get_entity",
  "create_entity",
  "update_entity",
  "enrich_entity",
  "list_contacts",
  "create_contact",
  "update_contact",
  "search",
  "create_segment",
  "add_note",
  "export_csv",
];

export function ConnectionDemo() {
  const reduce = useReducedMotion();
  const [client, setClient] = useState(0);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(0); // how many handshake lines are shown
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(() => {
    clearTimers();
    setStep(0);
    setConnected(false);
    if (reduce) {
      setStep(handshake.length);
      setConnected(true);
      return;
    }
    handshake.forEach((_, i) => {
      timers.current.push(setTimeout(() => setStep(i + 1), 450 + i * 520));
    });
    timers.current.push(setTimeout(() => setConnected(true), 450 + handshake.length * 520));
  }, [reduce, clearTimers]);

  // Kick off once when scrolled into view.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started) {
          setStarted(true);
          run();
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [run, started]);

  useEffect(() => clearTimers, [clearTimers]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(clients[client].snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable, no-op */
    }
  }, [client]);

  return (
    <div ref={rootRef} className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-2">
      {/* Config card with client tabs */}
      <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-xl shadow-black/[0.04] dark:border-white/10 dark:shadow-black/40">
        <div className="flex items-center gap-1 border-b border-border p-2 dark:border-white/10">
          {clients.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClient(i)}
              aria-pressed={i === client}
              className={
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors " +
                (i === client ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")
              }
            >
              {c.label}
            </button>
          ))}
          <button
            type="button"
            onClick={copy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <AnimatePresence mode="wait">
          <motion.pre
            key={clients[client].id}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-x-auto p-5 font-mono text-xs leading-relaxed text-foreground/85"
          >
            <code>{clients[client].snippet}</code>
          </motion.pre>
        </AnimatePresence>
      </div>

      {/* Live handshake + tools */}
      <div className="flex flex-col overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-xl shadow-black/[0.04] dark:border-white/10 dark:shadow-black/40">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 dark:border-white/10">
          <span className="font-mono text-[11px] text-muted-foreground">scalar / mcp</span>
          <button
            type="button"
            onClick={run}
            className="rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            Replay
          </button>
        </div>
        <div className="flex-1 space-y-1 p-4 font-mono text-xs">
          {handshake.slice(0, step).map((l) => (
            <motion.p
              key={l.t}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className={l.tone === "muted" ? "text-muted-foreground" : "text-foreground"}
            >
              <span className="text-primary">{"> "}</span>
              {l.t}
            </motion.p>
          ))}
          <AnimatePresence>
            {connected && (
              <motion.p
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 pt-1 text-success"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                connected
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {connected && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="grid grid-cols-2 gap-1.5 border-t border-border p-4 sm:grid-cols-3 dark:border-white/10"
            >
              {tools.map((t, i) => (
                <motion.span
                  key={t}
                  initial={reduce ? false : { opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, delay: i * 0.03, ease: EASE }}
                  className="truncate rounded-lg border border-border bg-background/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground/75 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  {t}
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
