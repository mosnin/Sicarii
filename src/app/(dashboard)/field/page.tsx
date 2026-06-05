"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { cn } from "@/lib/utils";

type Tab = "segments" | "pipelines";

const STAGES = ["NEW", "ENRICHED", "PROSPECTING", "ENGAGING", "REPLYING", "WON", "LOST"] as const;
const CONVO = ["OPEN", "AWAITING_REPLY", "STALLED", "CLOSED"] as const;
type Stage = (typeof STAGES)[number];

const stageLabel: Record<Stage, string> = {
  NEW: "New", ENRICHED: "Enriched", PROSPECTING: "Prospecting", ENGAGING: "Engaging",
  REPLYING: "Replying", WON: "Won", LOST: "Lost",
};

export default function FieldPage() {
  const [tab, setTab] = useState<Tab>("segments");

  return (
    <div className="space-y-8">
      <FloatIn>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-6 py-9 sm:px-10 sm:py-12">
            <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary/80">Scalar // Field</p>
            <h1 className="font-brand mt-2 text-3xl text-foreground sm:text-4xl">Field</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Build customer segments from a prompt, then run them as agentic
              pipelines. Your agents work the deals; you watch them move.
            </p>
            {/* Toggle */}
            <div className="mt-5 inline-flex rounded-full border border-border bg-background/70 p-1 backdrop-blur">
              {(["segments", "pipelines"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                    tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </FloatIn>

      {tab === "segments" ? <SegmentsPanel /> : <PipelinesPanel />}
    </div>
  );
}

/* ----------------------------- Segments ----------------------------- */

type Segment = { id: string; name: string; goal: string | null; source: string | null; _count: { members: number } };

function SegmentsPanel() {
  const [items, setItems] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"none" | "manual" | "prompt">("none");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [quantity, setQuantity] = useState("20");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/segments").then((r) => r.json()).catch(() => ({}));
    setItems(d.segments ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createManual() {
    if (!name.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/segments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (res.ok) { setName(""); setMode("none"); load(); }
    } finally { setBusy(false); }
  }

  async function build() {
    if (!goal.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/segments/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, quantity: Number(quantity) || 20 }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setGoal(""); setMode("none"); setMsg(`Built "${d.segment?.name}" with ${d.matched} prospects.`); load(); }
      else setMsg(d.error ?? "Build failed.");
    } catch { setMsg("Network error."); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this segment?")) return;
    await fetch(`/api/segments/${id}`, { method: "DELETE" });
    load();
  }

  async function startPipeline(seg: Segment) {
    const res = await fetch("/api/pipelines", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: seg.name, segmentId: seg.id }),
    });
    if (res.ok) setMsg(`Started a pipeline from "${seg.name}". Switch to Pipelines to work it.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setMode(mode === "prompt" ? "none" : "prompt")} variant={mode === "prompt" ? "glow" : "default"}>
          Auto create
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode(mode === "manual" ? "none" : "manual")}>
          Manual
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>

      <AnimatePresence>
        {mode === "prompt" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Describe who you want. Scalar matches your closest <span className="text-foreground">enriched, not-yet-contacted</span> prospects.
              </p>
              <textarea
                value={goal} onChange={(e) => setGoal(e.target.value)} rows={3}
                placeholder="e.g. Series A fintech founders in NYC who'd want automated lead intelligence"
                className="w-full resize-y rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">How many</label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-20" />
                <Button size="sm" onClick={build} disabled={busy || !goal.trim()}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Build segment
                </Button>
              </div>
            </div>
          </motion.div>
        )}
        {mode === "manual" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex gap-2 rounded-2xl border border-border bg-card p-4">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Segment name" />
              <Button size="sm" onClick={createManual} disabled={busy || !name.trim()}>Create</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? null : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-brand text-base">No segments yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Build one from a prompt to target your best prospects.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-brand truncate text-base">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{s._count.members} prospect{s._count.members === 1 ? "" : "s"}</p>
                </div>
                {s.source === "prompt" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">AI-built</span>}
              </div>
              {s.goal && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{s.goal}</p>}
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => startPipeline(s)}>Start pipeline</Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => remove(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Pipelines ----------------------------- */

type Pipeline = { id: string; name: string; goal: string | null; _count: { entries: number } };
type SegmentOpt = { id: string; name: string; _count: { members: number } };

function PipelinesPanel() {
  const [items, setItems] = useState<Pipeline[]>([]);
  const [segments, setSegments] = useState<SegmentOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      fetch("/api/pipelines").then((r) => r.json()).catch(() => ({})),
      fetch("/api/segments").then((r) => r.json()).catch(() => ({})),
    ]);
    setItems(p.pipelines ?? []);
    setSegments(s.segments ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim() || !segmentId) { setErr("Name and a segment are required."); return; }
    setCreating(true); setErr(null);
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, goal: objective, segmentId }),
      });
      if (res.ok) { setName(""); setObjective(""); setSegmentId(""); setOpen(false); load(); }
      else { const d = await res.json().catch(() => ({})); setErr(d.error ?? "Couldn't create pipeline."); }
    } finally { setCreating(false); }
  }

  if (selected) return <PipelineBoard id={selected} onBack={() => { setSelected(null); load(); }} />;

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setOpen((o) => !o)} variant={open ? "glow" : "default"}>New pipeline</Button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pipeline name" />
              <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective, e.g. book 10 demos with fintech founders" />
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Assign a segment to work</label>
                <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}
                  className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Select a segment…</option>
                  {segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s._count.members})</option>)}
                </select>
                {segments.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Create a segment first, then assign it here.</p>}
              </div>
              {err && <p className="text-xs text-destructive">{err}</p>}
              <Button size="sm" onClick={create} disabled={creating || !name.trim() || !segmentId}>
                {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Create pipeline
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? null : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-brand text-base">No pipelines yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one and assign a segment to start working the deals.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <button key={p.id} type="button" onClick={() => setSelected(p.id)}
              className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30">
              <p className="font-brand text-base">{p.name}</p>
              {p.goal && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.goal}</p>}
              <p className="mt-1 text-sm text-muted-foreground">{p._count.entries} in pipeline</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Entry = {
  id: string; stage: Stage; dealScore: number | null; conversationStatus: string;
  contact: { id: string; name: string | null; email: string | null; title: string | null; company: string | null };
};

function PipelineBoard({ id, onBack }: { id: string; onBack: () => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await fetch(`/api/pipelines/${id}`).then((r) => r.json()).catch(() => ({}));
    setName(d.pipeline?.name ?? "Pipeline");
    setGoal(d.pipeline?.goal ?? null);
    setEntries(d.pipeline?.entries ?? []);
    setLoading(false);
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function patch(entryId: string, body: Record<string, unknown>) {
    setEntries((es) => es.map((e) => (e.id === entryId ? { ...e, ...body } as Entry : e)));
    await fetch(`/api/pipelines/${id}/entries`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId, ...body }),
    });
  }

  const move = (e: Entry, dir: -1 | 1) => {
    const i = STAGES.indexOf(e.stage);
    const next = STAGES[Math.max(0, Math.min(STAGES.length - 1, i + dir))];
    if (next !== e.stage) patch(e.id, { stage: next });
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All pipelines
      </button>
      <div>
        <h2 className="font-brand text-xl">{name}</h2>
        {goal && <p className="mt-0.5 text-sm text-muted-foreground">Objective: {goal}</p>}
      </div>

      {loading ? null : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one in this pipeline yet. It is seeded from the assigned segment on creation.</p>
      ) : (
        // Kanban: a column per stage.
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const col = entries.filter((e) => e.stage === stage);
            return (
              <div key={stage} className="flex w-72 shrink-0 flex-col rounded-2xl border border-border bg-muted/30 p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stageLabel[stage]}</span>
                  <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((e) => (
                    <div key={e.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.contact.name || e.contact.email || "Unnamed"}</p>
                          <p className="truncate text-xs text-muted-foreground">{[e.contact.title, e.contact.company].filter(Boolean).join(" · ")}</p>
                        </div>
                        <DealScore value={e.dealScore} onChange={(v) => patch(e.id, { dealScore: v })} />
                      </div>
                      <select value={e.conversationStatus} onChange={(ev) => patch(e.id, { conversationStatus: ev.target.value })}
                        className="mt-2 w-full rounded-full border border-border bg-background px-3 py-1 text-xs">
                        {CONVO.map((c) => <option key={c} value={c}>{c.replace("_", " ").toLowerCase()}</option>)}
                      </select>
                      <div className="mt-2 flex items-center justify-between">
                        <button type="button" onClick={() => move(e, -1)} disabled={STAGES.indexOf(e.stage) === 0}
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30">‹ Back</button>
                        <button type="button" onClick={() => move(e, 1)} disabled={STAGES.indexOf(e.stage) === STAGES.length - 1}
                          className="rounded-md px-2 py-1 text-xs text-primary hover:bg-muted disabled:opacity-30">Advance ›</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DealScore({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const tone = value == null ? "border-border bg-muted text-muted-foreground"
    : value >= 70 ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
    : value >= 40 ? "border-primary/30 bg-primary/10 text-primary"
    : "border-border bg-muted text-muted-foreground";
  return (
    <input
      type="number" min={0} max={100} value={value ?? ""} placeholder="--"
      onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
      title="Deal score 0-100"
      className={cn("h-9 w-14 shrink-0 rounded-full border text-center text-sm font-medium tabular-nums focus:outline-none", tone)}
    />
  );
}
