"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles, Trash2, UserPlus, ChevronDown, Check, RefreshCw, Globe, FileSearch } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Aspect = "firmographics" | "tech-stack" | "funding" | "traffic" | "overview" | "news";

const ASPECTS: { id: Aspect; label: string }[] = [
  { id: "firmographics", label: "Firmographics" },
  { id: "tech-stack", label: "Tech stack" },
  { id: "funding", label: "Funding & acquisition" },
  { id: "traffic", label: "Website traffic" },
  { id: "overview", label: "Overview" },
  { id: "news", label: "Recent news" },
];

export function EntityActions({
  entityId,
  hasDomain,
}: {
  entityId: string;
  hasDomain: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [running, setRunning] = useState<Aspect | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  // Deep website analysis (Firecrawl): company context + logo + people found.
  async function analyzeSite() {
    setAnalyzing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/entities/${entityId}/analyze-site`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const bits = [];
        if (data.logo) bits.push("logo");
        if (data.created > 0) bits.push(`${data.created} contact${data.created === 1 ? "" : "s"}`);
        setMsg(bits.length ? `Analyzed site, added ${bits.join(" + ")}.` : "Analyzed site, context updated.");
        router.refresh();
      } else {
        setMsg(data.error || "Couldn't analyze the site.");
      }
    } finally {
      setAnalyzing(false);
    }
  }

  // Enrich a single aspect; additive - running one never blocks the others.
  async function enrich(type: Aspect) {
    setRunning(type);
    setMsg(null);
    try {
      const res = await fetch(`/api/entities/${entityId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone((d) => ({ ...d, [type]: true }));
        router.refresh();
      } else {
        setMsg(data.error || "Enrichment failed.");
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setRunning(null);
    }
  }

  // Deep report: OpenAI agent assembles offerings, target market, news, intent
  // signals, and decision makers (verified + added) from analyze + web search.
  async function deepReport() {
    setReporting(true);
    setMsg("Researching the company, this can take up to a minute…");
    try {
      const res = await fetch(`/api/entities/${entityId}/deep-report`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(
          data.created > 0
            ? `Report ready, added ${data.created} decision maker${data.created === 1 ? "" : "s"}.`
            : "Report ready."
        );
        router.refresh();
      } else {
        setMsg(data.error || "Couldn't generate the report.");
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setReporting(false);
    }
  }

  async function spawnContacts() {
    setSpawning(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/entities/${entityId}/spawn-contacts`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(
          data.created > 0
            ? `Added ${data.created} contact${data.created === 1 ? "" : "s"}${data.skipped ? ` · ${data.skipped} already known` : ""}`
            : "No new contacts found."
        );
        if (data.created > 0) router.refresh();
      } else {
        setMsg(data.error || "Couldn't research contacts.");
      }
    } finally {
      setSpawning(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this entity? Its contacts will be unlinked, not deleted.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/entities/${entityId}`, { method: "DELETE" });
      if (res.ok) router.push("/crm?tab=entities");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          variant="glow"
          size="sm"
          onClick={deepReport}
          disabled={reporting || busy}
          title="Full research report: offerings, market, news, intent, decision makers"
        >
          <FileSearch className="mr-1 h-4 w-4" />
          {reporting ? "Researching…" : "Deep report"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={analyzeSite}
          disabled={analyzing || busy}
          title="Deep-analyze the website for context, logo, and people"
        >
          <Globe className="mr-1 h-4 w-4" />
          {analyzing ? "Analyzing…" : "Analyze site"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={spawnContacts}
          disabled={spawning || busy}
          title="Research decision makers and add the ones you don't have"
        >
          <UserPlus className="mr-1 h-4 w-4" />
          {spawning ? "Researching…" : "Spawn contacts"}
        </Button>

        {/* Enrich dropdown - run any aspect, any number of times */}
        <div className="relative">
          <Button
            variant="glow"
            size="sm"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={busy || !hasDomain}
            title={hasDomain ? "Enrich this company" : "Add a domain to enrich"}
          >
            <Sparkles className="mr-1 h-4 w-4" />
            Enrich
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", menuOpen && "rotate-180")} />
          </Button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl"
                >
                  {ASPECTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => enrich(a.id)}
                      disabled={running !== null}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <span>{a.label}</span>
                      {running === a.id ? (
                        <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="inline-flex">
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                        </motion.span>
                      ) : done[a.id] ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : null}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={remove}
          disabled={busy || spawning}
          aria-label="Delete entity"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
