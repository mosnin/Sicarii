"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, ChevronDown, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { cn } from "@/lib/utils";

type Monitor = {
  id: string; name: string; query: string; frequency: string; active: boolean;
  autoAdd: boolean; lastRunAt: string | null; _count: { runs: number };
};

const FREQ = ["hourly", "daily", "weekly"] as const;

export default function RadarPage() {
  const [items, setItems] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [autoAdd, setAutoAdd] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/intent-monitors").then((r) => r.json()).catch(() => ({}));
    setItems(d.monitors ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!query.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/intent-monitors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, name, frequency, autoAdd }),
      });
      if (res.ok) { setQuery(""); setName(""); setOpen(false); load(); }
      else { const d = await res.json().catch(() => ({})); setErr(d.error ?? "Couldn't create."); }
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this radar and its history?")) return;
    await fetch(`/api/intent-monitors?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-8">
      <FloatIn>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-6 py-9 sm:px-10 sm:py-12">
            <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary/80">Scalar // Radar</p>
            <h1 className="font-brand mt-2 text-3xl text-foreground sm:text-4xl">Radar</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Standing scans that watch for in-market signals on a schedule. Describe
              what you&apos;re looking for; Scalar pulls it and, if you let it, adds
              new records with context, automatically.
            </p>
            <Button className="mt-5" size="sm" onClick={() => setOpen((o) => !o)} variant={open ? "glow" : "default"}>
              New radar
            </Button>
          </div>
        </div>
      </FloatIn>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">What are you looking for?</label>
                <textarea
                  value={query} onChange={(e) => setQuery(e.target.value)} rows={3}
                  placeholder="e.g. companies hiring SDRs and raising a Series A in climate tech"
                  className="w-full resize-y rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Name (optional)</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={query.slice(0, 40)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">How often</label>
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)}
                    className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    {FREQ.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <button type="button" onClick={() => setAutoAdd((a) => !a)} className="flex items-center gap-2 text-sm">
                <span className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", autoAdd ? "bg-primary" : "bg-muted")}>
                  <span className={cn("h-4 w-4 rounded-full bg-background transition-transform", autoAdd && "translate-x-4")} />
                </span>
                <span className="text-muted-foreground">Automatically add new records to the CRM</span>
              </button>
              {err && <p className="text-xs text-destructive">{err}</p>}
              <Button size="sm" onClick={create} disabled={busy || !query.trim()}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Create radar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? null : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-brand text-base">No radars yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one to start watching for in-market signals.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m, i) => <RadarCard key={m.id} monitor={m} delay={i * 0.05} onDelete={() => remove(m.id)} />)}
        </div>
      )}
    </div>
  );
}

type Run = { id: string; found: number; added: number; addedToCrm: boolean; createdAt: string; items: { title?: string; url?: string; summary?: string }[] | null };

function RadarCard({ monitor, delay, onDelete }: { monitor: Monitor; delay: number; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    const d = await fetch(`/api/intent-monitors/${monitor.id}/runs`).then((r) => r.json()).catch(() => ({}));
    setRuns(d.runs ?? []);
  }, [monitor.id]);

  async function runNow() {
    setRunning(true); setNote(null);
    try {
      const res = await fetch(`/api/intent-monitors/${monitor.id}/run`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setNote(res.ok ? `Pulled ${d.found}${d.added ? `, added ${d.added}` : ""}.` : (d.error ?? "Run failed."));
      if (res.ok) { setExpanded(true); loadRuns(); }
    } finally { setRunning(false); }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && runs === null) loadRuns();
  }

  return (
    <FloatIn delay={delay}>
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-brand truncate text-base">{monitor.name}</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{monitor.frequency}</span>
              {monitor.autoAdd
                ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">auto-add</span>
                : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">review</span>}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{monitor.query}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {monitor._count.runs} run{monitor._count.runs === 1 ? "" : "s"}
              {monitor.lastRunAt ? ` · last ${new Date(monitor.lastRunAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Run now
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <button type="button" onClick={toggle} aria-label="History" className="text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        </div>

        {note && <p className="px-5 pb-2 text-xs text-muted-foreground">{note}</p>}

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-border">
              <div className="space-y-2 p-4">
                {runs === null ? (
                  <p className="text-sm text-muted-foreground">Loading history…</p>
                ) : runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs yet. Hit Run now to pull results.</p>
                ) : (
                  runs.map((run) => <RunRow key={run.id} run={run} onChanged={loadRuns} />)
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FloatIn>
  );
}

function RunRow({ run, onChanged }: { run: Run; onChanged: () => void }) {
  const [show, setShow] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const items = run.items ?? [];

  async function addToCrm() {
    setAdding(true); setMsg(null);
    try {
      const res = await fetch(`/api/monitor-runs/${run.id}/add-to-crm`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Added ${d.entitiesAdded} companies, ${d.contactsAdded} people.` : (d.error ?? "Failed."));
      if (res.ok) onChanged();
    } finally { setAdding(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center gap-2 text-left text-sm">
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", show && "rotate-180")} />
          <span className="text-foreground">{new Date(run.createdAt).toLocaleString()}</span>
          <span className="text-muted-foreground">· {run.found} found{run.added ? ` · ${run.added} added` : ""}</span>
        </button>
        {!run.addedToCrm && items.length > 0 && (
          <Button size="sm" variant="outline" onClick={addToCrm} disabled={adding}>
            {adding ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Add to CRM
          </Button>
        )}
        {run.addedToCrm && <span className="text-[11px] text-primary">in CRM</span>}
      </div>
      {msg && <p className="mt-1 pl-5 text-xs text-muted-foreground">{msg}</p>}
      <AnimatePresence>
        {show && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 space-y-1.5 overflow-hidden pl-5">
            {items.length === 0 ? <li className="text-xs text-muted-foreground">Nothing pulled.</li> : items.map((it, i) => (
              <li key={i} className="text-xs">
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  {it.title || it.url} <ExternalLink className="h-3 w-3" />
                </a>
                {it.summary && <p className="text-muted-foreground line-clamp-2">{it.summary}</p>}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
