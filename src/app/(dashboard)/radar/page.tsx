"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, ChevronDown, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-5">
      <FloatIn>
        <div className="relative overflow-hidden rounded-[8px] border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
          <div>
            <p className="font-mono text-xs text-primary/80">Scalar // Radar</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Radar</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Standing scans that watch for in-market signals on a schedule. Describe
              what you&apos;re looking for; Scalar pulls it and, if you let it, adds
              new records with context, automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setOpen((o) => !o)} variant={open ? "outline" : "default"}>
              New radar
            </Button>
          </div>
        </div>
        </div>
      </FloatIn>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <section className="rounded-[8px] border border-border bg-background">
              <header className="flex h-10 items-center border-b border-border px-3">
                <h2 className="text-sm font-medium text-foreground">New radar</h2>
              </header>
              <div className="space-y-3 p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">What are you looking for?</label>
                  <textarea
                    value={query} onChange={(e) => setQuery(e.target.value)} rows={3}
                    placeholder="e.g. companies hiring SDRs and raising a Series A in climate tech"
                    className="w-full resize-y rounded-[4px] border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Name (optional)</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={query.slice(0, 40)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">How often</label>
                    <select value={frequency} onChange={(e) => setFrequency(e.target.value)}
                      className="h-8 w-full rounded-[4px] border border-input bg-background px-2.5 text-sm focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15">
                      {FREQ.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <button type="button" onClick={() => setAutoAdd((a) => !a)} className="flex items-center gap-2 text-sm">
                  <span className={cn("flex h-4 w-7 items-center rounded-full p-0.5 transition-colors", autoAdd ? "bg-primary" : "bg-muted-foreground/30")}>
                    <span className={cn("h-3 w-3 rounded-full bg-white transition-transform", autoAdd && "translate-x-3")} />
                  </span>
                  <span className="text-muted-foreground">Automatically add new records to the CRM</span>
                </button>
                {err && <p className="text-xs text-destructive">{err}</p>}
                <div className="flex justify-end">
                  <Button size="sm" onClick={create} disabled={busy || !query.trim()}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.6} /> : null} Create radar
                  </Button>
                </div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? null : items.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">No radars yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one to start watching for in-market signals.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[8px] border border-border bg-background">
          {items.map((m, i) => <RadarCard key={m.id} monitor={m} delay={i * 0.03} onDelete={() => remove(m.id)} />)}
        </ul>
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
    <li>
      <FloatIn delay={delay}>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <button type="button" onClick={toggle} aria-label="History" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronDown className={cn("h-4 w-4 transition-transform", !expanded && "-rotate-90")} strokeWidth={1.6} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{monitor.name}</p>
              <Badge variant="secondary">{monitor.frequency}</Badge>
              {monitor.autoAdd
                ? <Badge variant="primary">auto-add</Badge>
                : <Badge variant="secondary">review</Badge>}
            </div>
            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{monitor.query}</p>
          </div>
          <p className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
            {monitor._count.runs} run{monitor._count.runs === 1 ? "" : "s"}
            {monitor.lastRunAt ? ` · last ${new Date(monitor.lastRunAt).toLocaleDateString()}` : ""}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.6} /> : null} Run now
            </Button>
            <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" strokeWidth={1.6} />
            </Button>
          </div>
        </div>
        <p className="px-3 pb-2 pl-12 text-xs text-muted-foreground sm:hidden">
          {monitor._count.runs} run{monitor._count.runs === 1 ? "" : "s"}
          {monitor.lastRunAt ? ` · last ${new Date(monitor.lastRunAt).toLocaleDateString()}` : ""}
        </p>

        {note && <p className="px-3 pb-2 pl-12 text-xs text-muted-foreground">{note}</p>}

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-border bg-muted/30">
              <div className="p-3">
                {runs === null ? (
                  <p className="text-sm text-muted-foreground">Loading history…</p>
                ) : runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs yet. Hit Run now to pull results.</p>
                ) : (
                  <div className="overflow-x-auto rounded-[8px] border border-border bg-background">
                    <table className="twenty-table">
                      <thead><tr><th>Run</th><th>Found</th><th>Added</th><th>CRM</th></tr></thead>
                      <tbody>
                        {runs.map((run) => <RunRow key={run.id} run={run} onChanged={loadRuns} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </FloatIn>
    </li>
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
    <>
      <tr>
        <td>
          <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center gap-1.5 text-left text-sm">
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !show && "-rotate-90")} strokeWidth={1.6} />
            <span className="whitespace-nowrap text-foreground">{new Date(run.createdAt).toLocaleString()}</span>
          </button>
        </td>
        <td className="tabular-nums text-muted-foreground">{run.found} found</td>
        <td className="tabular-nums text-muted-foreground">{run.added ? `${run.added} added` : ""}</td>
        <td>
          {!run.addedToCrm && items.length > 0 && (
            <Button size="sm" variant="outline" className="h-6" onClick={addToCrm} disabled={adding}>
              {adding ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.6} /> : null} Add to CRM
            </Button>
          )}
          {run.addedToCrm && <Badge variant="success">in CRM</Badge>}
        </td>
      </tr>
      {msg && (
        <tr>
          <td colSpan={4} className="text-xs text-muted-foreground">{msg}</td>
        </tr>
      )}
      {show && (
        <tr>
          <td colSpan={4} className="py-2">
            <AnimatePresence>
              <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-1.5 overflow-hidden pl-6">
                {items.length === 0 ? <li className="text-xs text-muted-foreground">Nothing pulled.</li> : items.map((it, i) => (
                  <li key={i} className="text-sm">
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {it.title || it.url} <ExternalLink className="h-3 w-3" strokeWidth={1.6} />
                    </a>
                    {it.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{it.summary}</p>}
                  </li>
                ))}
              </motion.ul>
            </AnimatePresence>
          </td>
        </tr>
      )}
    </>
  );
}
