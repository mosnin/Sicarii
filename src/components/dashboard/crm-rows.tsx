"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Check, Trash2, Loader2, Sparkles, CheckSquare, Search, ChevronLeft, ChevronRight, X, Wand2, Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { cn } from "@/lib/utils";
import { BulkEnrichModal } from "@/components/dashboard/bulk-enrich-modal";

/* ---------- Types passed in from the server ---------- */

export type CrmContact = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  status: string;
  updatedAt: string;
  entity: { id: string; name: string } | null;
};

export type CrmEntity = {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  domain: string | null;
  updatedAt: string;
  _count: { contacts: number };
};

/* -------- Status helpers -------- */

function statusColor(status: string) {
  switch (status) {
    case "CONTACTED":
    case "REPLIED":
      return "orange";
    case "QUALIFIED":
    case "WON":
      return "success";
    case "LOST":
      return "destructive";
    default:
      return "secondary";
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    NEW: "New", ENRICHED: "Enriched", LEAD: "Lead", CONTACTED: "Contacted",
    REPLIED: "Replied", QUALIFIED: "Qualified", WON: "Won", LOST: "Lost", ARCHIVED: "Archived",
  };
  return map[status] ?? status;
}

const STATUS_RANK: Record<string, number> = {
  NEW: 0, ENRICHED: 1, CONTACTED: 2, REPLIED: 3, QUALIFIED: 4, WON: 5, LOST: 6, ARCHIVED: 7,
};

// Fit score chip (0-100) vs. saved product context.
function FitChip({ score }: { score?: number }) {
  if (score == null) return null;
  const tone =
    score >= 70 ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
    : score >= 40 ? "border-primary/30 bg-primary/10 text-primary"
    : "border-border bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums", tone)}>
      <Target className="h-3 w-3" />
      {score}
    </span>
  );
}

/* -------- primitives -------- */

function RowCheckbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </button>
  );
}

type SortOption<T> = { id: string; label: string; cmp: (a: T, b: T) => number };

/* ================= generic browser ================= */

const PAGE_SIZE = 20;

function CrmBrowser<T extends { id: string }>({
  items,
  kind,
  noun,
  deleteEndpoint,
  enrichEndpoint,
  searchText,
  sortOptions,
  hrefFor,
  renderRow,
  searchPlaceholder,
}: {
  items: T[];
  kind: "contact" | "entity";
  noun: string;
  deleteEndpoint: string;
  enrichEndpoint: string;
  searchText: (i: T) => string;
  sortOptions: SortOption<T>[];
  hrefFor: (i: T) => string;
  renderRow: (i: T, score?: number) => React.ReactNode;
  searchPlaceholder: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [sortId, setSortId] = useState(sortOptions[0].id);
  const [page, setPage] = useState(0);
  const [smart, setSmart] = useState<string[] | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartErr, setSmartErr] = useState<string | null>(null);

  // Fit scoring vs. saved product context
  const [scores, setScores] = useState<Record<string, number> | null>(null);
  const [fitActive, setFitActive] = useState(false);
  const [fitLoading, setFitLoading] = useState(false);

  // selection
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // enrich modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalState, setModalState] = useState<"confirm" | "running" | "done">("confirm");
  const [resultText, setResultText] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => searchText(i).toLowerCase().includes(q)) : items;
  }, [items, query, searchText]);

  const sorted = useMemo(() => {
    if (smart) {
      const rank = new Map(smart.map((id, idx) => [id, idx] as const));
      return [...filtered].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    }
    if (fitActive && scores) {
      return [...filtered].sort((a, b) => (scores[b.id] ?? -1) - (scores[a.id] ?? -1));
    }
    const opt = sortOptions.find((o) => o.id === sortId) ?? sortOptions[0];
    return [...filtered].sort(opt.cmp);
  }, [filtered, sortId, smart, fitActive, scores, sortOptions]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const filteredIds = filtered.map((i) => i.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filteredIds));
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  async function runSmart() {
    const q = query.trim();
    if (!q) { setSmartErr("Type what you're looking for, then Smart sort."); return; }
    setSmartLoading(true); setSmartErr(null);
    try {
      const res = await fetch("/api/crm/semantic-sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, query: q,
          items: filtered.slice(0, 120).map((i) => ({ id: i.id, text: searchText(i).slice(0, 280) })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.orderedIds)) { setSmart(d.orderedIds); setPage(0); }
      else setSmartErr(d.error ?? "Smart sort failed.");
    } catch { setSmartErr("Network error."); }
    finally { setSmartLoading(false); }
  }

  async function runFit() {
    setFitLoading(true); setSmartErr(null);
    try {
      const res = await fetch("/api/crm/fit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          items: filtered.slice(0, 120).map((i) => ({ id: i.id, text: searchText(i).slice(0, 280) })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.scores) { setScores(d.scores); setFitActive(true); setSmart(null); setPage(0); }
      else setSmartErr(d.error ?? "Fit scoring failed.");
    } catch { setSmartErr("Network error."); }
    finally { setFitLoading(false); }
  }

  async function remove() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch(deleteEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (res.ok) { exitSelect(); startTransition(() => router.refresh()); }
    } finally { setDeleting(false); }
  }

  async function confirmEnrich() {
    const count = selected.size;
    setModalState("running");
    try {
      const res = await fetch(enrichEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const d = (await res.json().catch(() => ({}))) as { enriched?: number; skipped?: number; fieldsFilled?: number; error?: string };
      if (res.ok) {
        const parts = [`Enriched ${d.enriched ?? 0} of ${count} ${noun}${count === 1 ? "" : "s"}.`];
        if (d.fieldsFilled) parts.push(`${d.fieldsFilled} fields filled.`);
        if (d.skipped) parts.push(`${d.skipped} skipped.`);
        setResultText(parts.join(" "));
        exitSelect();
        startTransition(() => router.refresh());
      } else setResultText(d.error ?? "Enrichment failed.");
    } catch { setResultText("Network error."); }
    finally { setModalState("done"); }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); if (smart) setSmart(null); }}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setQuery(""); setPage(0); setSmart(null); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={smart ? "glow" : "outline"}
            size="sm"
            onClick={smart ? () => setSmart(null) : runSmart}
            disabled={smartLoading}
            title="Sort by how well records match your search, using patterns"
          >
            {smartLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
            {smart ? "Smart on" : "Smart sort"}
          </Button>

          <Button
            variant={fitActive ? "glow" : "outline"}
            size="sm"
            onClick={fitActive ? () => setFitActive(false) : runFit}
            disabled={fitLoading}
            title="Score each record 0-100 on fit to your saved Product Context"
          >
            {fitLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Target className="mr-1.5 h-4 w-4" />}
            {fitActive ? "Fit on" : "Score fit"}
          </Button>

          <select
            value={smart ? "__smart" : fitActive ? "__fit" : sortId}
            onChange={(e) => {
              setSmart(null);
              setFitActive(false);
              setSortId(e.target.value);
              setPage(0);
            }}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {smart && <option value="__smart">Smart match</option>}
            {fitActive && <option value="__fit">Best fit</option>}
            {sortOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>

          {!selectMode ? (
            <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)} className="text-muted-foreground">
              <CheckSquare className="mr-1.5 h-4 w-4" />
              Select
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={exitSelect}>Cancel</Button>
          )}
        </div>
      </div>

      {smartErr && <p className="px-1 text-xs text-destructive">{smartErr}</p>}

      {/* Select-mode action bar */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2"
          >
            <button type="button" onClick={toggleAll} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <RowCheckbox checked={allSelected} onToggle={toggleAll} label="Select all" />
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </button>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="glow" size="sm" onClick={() => { setResultText(null); setModalState("confirm"); setModalOpen(true); }}>
                  <Sparkles className="mr-1 h-4 w-4" /> Enrich {selected.size}
                </Button>
                <Button variant="destructive" size="sm" onClick={remove} disabled={deleting}>
                  {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                  Delete {selected.size}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rows */}
      {pageItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-brand text-base text-foreground">No matches</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query ? `Nothing matches "${query}".` : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pageItems.map((item, i) => (
            <RowCard
              key={item.id}
              href={hrefFor(item)}
              selectMode={selectMode}
              selected={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
              delay={Math.min(i * 0.03, 0.3)}
            >
              {renderRow(item, scores?.[item.id])}
            </RowCard>
          ))}
        </div>
      )}

      {/* Pagination */}
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-xs text-muted-foreground">
            {safePage * PAGE_SIZE + 1}-{Math.min(sorted.length, (safePage + 1) * PAGE_SIZE)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 text-xs text-muted-foreground tabular-nums">{safePage + 1} / {pageCount}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <BulkEnrichModal
        open={modalOpen}
        count={selected.size}
        noun={noun}
        state={modalState}
        resultText={resultText}
        onConfirm={confirmEnrich}
        onClose={() => { if (modalState !== "running") setModalOpen(false); }}
      />
    </div>
  );
}

function RowCard({
  href, selectMode, selected, onToggle, delay, children,
}: {
  href: string; selectMode: boolean; selected: boolean; onToggle: () => void; delay: number; children: React.ReactNode;
}) {
  return (
    <FloatIn delay={delay}>
      <div className="group flex items-center gap-3">
        {selectMode && <RowCheckbox checked={selected} onToggle={onToggle} label="Select row" />}
        <Link
          href={href}
          className={cn(
            "flex flex-1 items-center justify-between gap-4 rounded-2xl bg-card px-5 py-4",
            "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_1px_3px_-1px_rgba(0,0,0,0.06)]",
            "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_-4px_rgba(0,0,0,0.12),0_2px_6px_-2px_rgba(90,176,232,0.12)]",
            selected && "ring-2 ring-primary/40"
          )}
        >
          {children}
        </Link>
      </div>
    </FloatIn>
  );
}

/* ================= Contacts ================= */

export function ContactRows({ contacts }: { contacts: CrmContact[] }) {
  const sortOptions: SortOption<CrmContact>[] = [
    { id: "recent", label: "Recently updated", cmp: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
    { id: "name", label: "Name A-Z", cmp: (a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "") },
    { id: "company", label: "Company A-Z", cmp: (a, b) => (a.entity?.name ?? "~").localeCompare(b.entity?.name ?? "~") },
    { id: "status", label: "Pipeline stage", cmp: (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) },
  ];

  return (
    <CrmBrowser
      items={contacts}
      kind="contact"
      noun="contact"
      deleteEndpoint="/api/contacts"
      enrichEndpoint="/api/contacts/bulk-enrich"
      searchPlaceholder="Search or describe who you're looking for…"
      searchText={(c) => [c.name, c.email, c.title, c.entity?.name, statusLabel(c.status)].filter(Boolean).join(" ")}
      sortOptions={sortOptions}
      hrefFor={(c) => `/crm/${c.id}`}
      renderRow={(c, score) => (
        <>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-foreground">{c.name || c.email || "Unnamed contact"}</span>
              <Badge variant={statusColor(c.status) as Parameters<typeof Badge>[0]["variant"]}>{statusLabel(c.status)}</Badge>
              <FitChip score={score} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {c.entity?.name && <span className="truncate">{c.entity.name}</span>}
              {c.email && <span className="truncate max-w-[200px]">{c.email}</span>}
              {c.title && <span className="truncate">{c.title}</span>}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</span>
        </>
      )}
    />
  );
}

/* ================= Entities ================= */

export function EntityRows({ entities }: { entities: CrmEntity[] }) {
  const sortOptions: SortOption<CrmEntity>[] = [
    { id: "recent", label: "Recently updated", cmp: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
    { id: "name", label: "Name A-Z", cmp: (a, b) => a.name.localeCompare(b.name) },
    { id: "industry", label: "Industry A-Z", cmp: (a, b) => (a.industry ?? "~").localeCompare(b.industry ?? "~") },
    { id: "contacts", label: "Most contacts", cmp: (a, b) => b._count.contacts - a._count.contacts },
    { id: "status", label: "Stage", cmp: (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) },
  ];

  return (
    <CrmBrowser
      items={entities}
      kind="entity"
      noun="company"
      deleteEndpoint="/api/entities"
      enrichEndpoint="/api/entities/bulk-enrich"
      searchPlaceholder="Search or describe the companies you want…"
      searchText={(e) => [e.name, e.industry, e.domain, statusLabel(e.status)].filter(Boolean).join(" ")}
      sortOptions={sortOptions}
      hrefFor={(e) => `/crm/entity/${e.id}`}
      renderRow={(e, score) => (
        <>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-foreground">{e.name}</span>
              <Badge variant={statusColor(e.status) as Parameters<typeof Badge>[0]["variant"]}>{statusLabel(e.status)}</Badge>
              <FitChip score={score} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {e.industry && <span className="truncate">{e.industry}</span>}
              {e.domain && <span className="truncate">{e.domain}</span>}
              <span>{e._count.contacts} contact{e._count.contacts === 1 ? "" : "s"}</span>
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{new Date(e.updatedAt).toLocaleDateString()}</span>
        </>
      )}
    />
  );
}
