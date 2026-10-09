"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

// Twenty kanban: each stage header is a tag-colored chip.
const stageTag: Record<Stage, string> = {
  NEW: "bg-muted text-muted-foreground",
  ENRICHED: "bg-tag-blue-bg text-tag-blue",
  PROSPECTING: "bg-tag-purple-bg text-tag-purple",
  ENGAGING: "bg-tag-orange-bg text-tag-orange",
  REPLYING: "bg-tag-blue-bg text-tag-blue",
  WON: "bg-tag-green-bg text-tag-green",
  LOST: "bg-tag-red-bg text-tag-red",
};

const rawSelect =
  "h-8 rounded-[4px] border border-input bg-background px-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15";

export default function FieldPage() {
  const [tab, setTab] = useState<Tab>("segments");

  return (
    <div className="space-y-5">
      <FloatIn>
        <div className="relative overflow-hidden rounded-[8px] border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-8">
            <p className="text-xs font-medium text-primary/80">Scalar // Field</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Field</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Build customer segments from a prompt, then run them as agentic
              pipelines. Your agents work the deals; you watch them move.
            </p>
          </div>
        </div>
        {/* Toggle */}
        <div className="mt-4 flex gap-1 border-b border-border">
          {(["segments", "pipelines"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px flex h-9 items-center border-b-2 px-2 text-sm capitalize transition-colors",
                tab === t
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
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
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "size">("recent");

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

  const q = filter.trim().toLowerCase();
  const visible = items
    .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.goal ?? "").toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return b._count.members - a._count.members;
      return 0; // "recent" keeps the API order (newest first)
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setMode(mode === "prompt" ? "none" : "prompt")} variant={mode === "prompt" ? "secondary" : "default"}>
          Auto create
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode(mode === "manual" ? "none" : "manual")}>
          Manual
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>

      <AnimatePresence>
        {mode === "prompt" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="space-y-3 rounded-[8px] border border-border bg-card p-3">
              <p className="text-sm text-muted-foreground">
                Describe who you want. Scalar matches your closest <span className="text-foreground">not-yet-worked</span> prospects.
              </p>
              <textarea
                value={goal} onChange={(e) => setGoal(e.target.value)} rows={3}
                placeholder="e.g. Series A fintech founders in NYC who'd want automated lead intelligence"
                className="w-full resize-y rounded-[4px] border border-input bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15"
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">How many</label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-20" />
                <Button size="sm" onClick={build} disabled={busy || !goal.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} /> : null} Build segment
                </Button>
              </div>
            </div>
          </motion.div>
        )}
        {mode === "manual" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="flex gap-2 rounded-[8px] border border-border bg-card p-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Segment name" />
              <Button size="sm" onClick={createManual} disabled={busy || !name.trim()}>Create</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter segments…"
            className="h-8 max-w-xs flex-1"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "recent" | "name" | "size")}
            className={rawSelect}
          >
            <option value="recent">Newest</option>
            <option value="name">Name (A-Z)</option>
            <option value="size">Most prospects</option>
          </select>
        </div>
      )}

      {loading ? null : items.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">No segments yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Build one from a prompt to target your best prospects.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No segments match &ldquo;{filter}&rdquo;.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[8px] border border-border bg-card">
          <table className="twenty-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prospects</th>
                <th>Goal</th>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-foreground">{s.name}</span>
                      {s.source === "prompt" && <Badge variant="primary">AI-built</Badge>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {s._count.members} prospect{s._count.members === 1 ? "" : "s"}
                  </td>
                  <td className="max-w-xs">
                    {s.goal && <p className="truncate text-muted-foreground">{s.goal}</p>}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => startPipeline(s)}>Start pipeline</Button>
                      <Button size="icon-sm" variant="ghost" className="hover:text-destructive" onClick={() => remove(s.id)}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VariantStatsPanel segments={items} />
    </div>
  );
}

/* ------------------- Self-optimizing outreach (read-only) ------------------ */

type VariantStat = {
  id: string;
  kind: "SUBJECT" | "OPENER";
  text: string;
  segmentId: string | null;
  sends: number;
  replies: number;
  replyRate: number;
  winning: boolean;
};

// Read-only: the agent creates and picks variants over MCP (select_variant),
// converging on the best subject line / opener per segment on its own. This
// panel just shows what it has learned so far - there is no "start an A/B
// test" control here by design.
function VariantStatsPanel({ segments }: { segments: Segment[] }) {
  const [stats, setStats] = useState<VariantStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/variants")
      .then((r) => r.json())
      .then((d) => setStats(d.variants ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || stats.length === 0) return null;

  const segName = (id: string | null) =>
    id ? (segments.find((s) => s.id === id)?.name ?? "Unlinked segment") : "General";

  const groups = new Map<string, VariantStat[]>();
  for (const v of stats) {
    const key = v.segmentId ?? "none";
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  return (
    <div className="space-y-2 pt-2">
      <p className="twenty-label">Self-optimizing outreach</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {[...groups.entries()].map(([key, vs]) => (
          <section key={key} className="rounded-[8px] border border-border bg-card">
            <header className="flex h-10 items-center border-b border-border px-3">
              <h3 className="truncate text-sm font-medium text-foreground">{segName(vs[0].segmentId)}</h3>
            </header>
            <ul className="divide-y divide-border">
              {vs.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{v.text}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {v.kind === "SUBJECT" ? "Subject" : "Opener"} &middot; {v.sends} sent &middot; {v.replies} replied
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {Math.round(v.replyRate * 100)}%
                    </span>
                    {v.winning && <Badge variant="success">Winning</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
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
      <Button size="sm" onClick={() => setOpen((o) => !o)} variant={open ? "secondary" : "default"}>New pipeline</Button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="space-y-3 rounded-[8px] border border-border bg-card p-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pipeline name" />
              <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective, e.g. book 10 demos with fintech founders" />
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Assign a segment to work</label>
                <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}
                  className={cn(rawSelect, "w-full")}>
                  <option value="">Select a segment…</option>
                  {segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s._count.members})</option>)}
                </select>
                {segments.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Create a segment first, then assign it here.</p>}
              </div>
              {err && <p className="text-xs text-destructive">{err}</p>}
              <Button size="sm" onClick={create} disabled={creating || !name.trim() || !segmentId}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} /> : null} Create pipeline
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? null : items.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">No pipelines yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one and assign a segment to start working the deals.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[8px] border border-border bg-card">
          {items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setSelected(p.id)}
                className="flex min-h-10 w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent">
                <span className="shrink-0 font-medium text-foreground">{p.name}</span>
                {p.goal && <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.goal}</span>}
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{p._count.entries} in pipeline</span>
              </button>
            </li>
          ))}
        </ul>
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

  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const drop = (stage: Stage) => {
    if (dragId) {
      const e = entries.find((x) => x.id === dragId);
      if (e && e.stage !== stage) patch(dragId, { stage });
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.6} /> All pipelines
      </button>
      <div>
        <h2 className="text-xl font-semibold text-foreground">{name}</h2>
        {goal && <p className="mt-1 text-sm text-muted-foreground">Objective: {goal}</p>}
      </div>

      {loading ? null : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one in this pipeline yet. It is seeded from the assigned segment on creation.</p>
      ) : (
        // Kanban: a column per stage. Snap-scrolls horizontally with a thin bar.
        <div className="thin-scroll flex snap-x snap-mandatory gap-2 overflow-x-auto pb-3 pr-4">
          {STAGES.map((stage) => {
            const col = entries.filter((e) => e.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(ev) => { ev.preventDefault(); setOverStage(stage); }}
                onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                onDrop={() => drop(stage)}
                className={cn(
                  "flex w-64 shrink-0 snap-start flex-col rounded-[8px] border p-1.5 transition-colors",
                  overStage === stage ? "border-primary/40 bg-primary/5" : "border-transparent bg-muted/40"
                )}
              >
                <div className="flex h-8 items-center gap-1.5 px-1">
                  <span className={cn("inline-flex h-5 items-center rounded-[4px] px-1.5 text-sm font-medium", stageTag[stage])}>{stageLabel[stage]}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{col.length}</span>
                </div>
                <div className="space-y-1.5">
                  {col.map((e) => (
                    <div
                      key={e.id}
                      draggable
                      onDragStart={() => setDragId(e.id)}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      className={cn(
                        "cursor-grab rounded-[4px] border border-border bg-background p-2 text-sm transition-colors hover:border-primary/30 active:cursor-grabbing",
                        dragId === e.id && "opacity-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{e.contact.name || e.contact.email || "Unnamed"}</p>
                          <p className="truncate text-xs text-muted-foreground">{[e.contact.title, e.contact.company].filter(Boolean).join(" · ")}</p>
                        </div>
                        <DealScore value={e.dealScore} onChange={(v) => patch(e.id, { dealScore: v })} />
                      </div>
                      <select value={e.conversationStatus} onChange={(ev) => patch(e.id, { conversationStatus: ev.target.value })}
                        className="mt-2 h-7 w-full rounded-[4px] border border-border bg-background px-2 text-xs text-muted-foreground focus:border-primary focus:outline-none">
                        {CONVO.map((c) => <option key={c} value={c}>{c.replace("_", " ").toLowerCase()}</option>)}
                      </select>
                      <div className="mt-1.5 flex items-center justify-between">
                        <button type="button" onClick={() => move(e, -1)} disabled={STAGES.indexOf(e.stage) === 0}
                          className="h-6 rounded-[4px] px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30">‹ Back</button>
                        <button type="button" onClick={() => move(e, 1)} disabled={STAGES.indexOf(e.stage) === STAGES.length - 1}
                          className="h-6 rounded-[4px] px-1.5 text-xs text-primary transition-colors hover:bg-accent disabled:opacity-30">Advance ›</button>
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
  const tone = value == null ? "bg-muted text-muted-foreground"
    : value >= 70 ? "bg-tag-green-bg text-tag-green"
    : value >= 40 ? "bg-tag-blue-bg text-tag-blue"
    : "bg-muted text-muted-foreground";
  return (
    <input
      type="number" min={0} max={100} value={value ?? ""} placeholder="--"
      onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
      title="Deal score 0-100"
      className={cn("h-6 w-11 shrink-0 rounded-[4px] border border-transparent text-center text-xs font-medium tabular-nums focus:border-primary focus:outline-none", tone)}
    />
  );
}
