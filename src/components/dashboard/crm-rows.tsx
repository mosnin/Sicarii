"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Check, Loader2, Search, ChevronDown, ChevronLeft, ChevronRight, X, Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { cn } from "@/lib/utils";
import { BulkEnrichModal } from "@/components/dashboard/bulk-enrich-modal";
import { CrmAvatar } from "@/components/dashboard/crm-avatar";

/* ---------- Types passed in from the server ---------- */

export type CrmContact = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  status: string;
  imageUrl: string | null;
  updatedAt: string;
  entity: { id: string; name: string } | null;
};

export type CrmEntity = {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  domain: string | null;
  location: string | null;
  logoUrl: string | null;
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
    score >= 70 ? "bg-green-500/10 text-green-600 dark:text-green-400"
    : score >= 40 ? "bg-primary/10 text-primary"
    : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-xs font-medium tabular-nums", tone)}>
      <Target className="h-3 w-3" strokeWidth={1.6} />
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
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary"
      )}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

/* -------- record table layout -------- */

// One cell in the record grid: hairline right border, 8px gutter.
const CELL = "flex h-full min-w-0 items-center gap-2 border-r border-border px-2 last:border-r-0";

type Column = { label: string; className: string };

// Small company/person chip used inside table cells (Twenty record chip).
function RecordChip({ label, shape }: { label: string; shape: "circle" | "square" }) {
  return (
    <span className="inline-flex h-5 max-w-full items-center gap-1 rounded-[4px] bg-muted px-1 text-sm text-foreground">
      <CrmAvatar label={label} shape={shape} size={14} />
      <span className="truncate">{label}</span>
    </span>
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
  columns,
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
  columns: Column[];
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
  const [filterOpen, setFilterOpen] = useState(false);

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
      if (res.ok && Array.isArray(d.orderedIds)) { setSmart(d.orderedIds); setPage(0); setFilterOpen(false); }
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
      if (res.ok && d.scores) { setScores(d.scores); setFitActive(true); setSmart(null); setPage(0); setFilterOpen(false); }
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
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); if (smart) setSmart(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") runSmart(); }}
            placeholder={searchPlaceholder}
            className="pl-8 pr-8"
          />
          {smartLoading ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" strokeWidth={1.6} />
          ) : query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setQuery(""); setPage(0); setSmart(null); }}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1 sm:ml-auto">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterOpen((o) => !o)}
              className={cn(filterOpen && "bg-muted text-foreground")}
            >
              Filter
              {(smart || fitActive || sortId !== sortOptions[0].id) && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              )}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", filterOpen && "rotate-180")} strokeWidth={1.6} />
            </Button>

            <AnimatePresence>
              {filterOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden
                    onClick={() => setFilterOpen(false)}
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-[8px] border border-border bg-background p-1 shadow-lg"
                  >
                    <p className="text-xs font-medium text-muted-foreground px-2 pb-1 pt-1.5">Sort by</p>
                    {sortOptions.map((o) => {
                      const active = !smart && !fitActive && sortId === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => { setSmart(null); setFitActive(false); setSortId(o.id); setPage(0); setFilterOpen(false); }}
                          className={cn(
                            "flex h-8 w-full items-center justify-between rounded-[4px] px-2 text-left text-sm transition-colors hover:bg-muted",
                            active ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          {o.label}
                          {active && <Check className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} />}
                        </button>
                      );
                    })}

                    <div className="-mx-1 my-1 h-px bg-border" />
                    <button
                      type="button"
                      onClick={runFit}
                      disabled={fitLoading}
                      className="flex h-8 w-full items-center justify-between rounded-[4px] px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <span>Score fit vs product</span>
                      {fitLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : fitActive ? <span className="text-xs font-medium text-primary">On</span> : null}
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {!selectMode ? (
            <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
              Select
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={exitSelect} className="bg-muted text-foreground">Cancel</Button>
          )}
        </div>
      </div>

      {smartErr && <p className="text-xs text-destructive">{smartErr}</p>}

      {/* Select-mode action bar */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex h-10 items-center justify-between gap-3 rounded-[8px] border border-border bg-muted/30 px-3"
          >
            <button type="button" onClick={toggleAll} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <RowCheckbox checked={allSelected} onToggle={toggleAll} label="Select all" />
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </button>
            {selected.size > 0 && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => { setResultText(null); setModalState("confirm"); setModalOpen(true); }}>
                  Enrich {selected.size}
                </Button>
                <Button variant="destructive" size="sm" onClick={remove} disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Delete {selected.size}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Record table */}
      {pageItems.length === 0 ? (
        <div className="rounded-[8px] border border-border px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No matches</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query ? `Nothing matches "${query}".` : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-border bg-background">
          <div className="flex h-8 items-stretch border-b border-border text-sm font-medium text-muted-foreground">
            {selectMode && (
              <div className="flex w-10 shrink-0 items-center justify-center border-r border-border">
                <RowCheckbox checked={allSelected} onToggle={toggleAll} label="Select all" />
              </div>
            )}
            <div className="flex min-w-0 flex-1 items-stretch">
              {columns.map((c) => (
                <div key={c.label} className={cn(CELL, "whitespace-nowrap", c.className)}>{c.label}</div>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border">
            {pageItems.map((item, i) => (
              <RowCard
                key={item.id}
                href={hrefFor(item)}
                selectMode={selectMode}
                selected={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                delay={Math.min(i * 0.015, 0.15)}
              >
                {renderRow(item, scores?.[item.id])}
              </RowCard>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground tabular-nums">
            {safePage * PAGE_SIZE + 1}-{Math.min(sorted.length, (safePage + 1) * PAGE_SIZE)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
            </Button>
            <span className="px-1.5 text-sm text-muted-foreground tabular-nums">{safePage + 1} / {pageCount}</span>
            <Button variant="outline" size="icon-sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
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
      <div
        className={cn(
          "group flex h-10 items-stretch transition-colors",
          selected ? "bg-primary/10" : "hover:bg-muted/40"
        )}
      >
        {selectMode && (
          <div className="flex w-10 shrink-0 items-center justify-center border-r border-border">
            <RowCheckbox checked={selected} onToggle={onToggle} label="Select row" />
          </div>
        )}
        <Link href={href} className="flex min-w-0 flex-1 items-stretch text-sm text-foreground">
          {children}
        </Link>
      </div>
    </FloatIn>
  );
}

/* -------- column sets (header + cells share widths) -------- */

const CONTACT_COLS = {
  name: "flex-1 min-w-[160px]",
  company: "hidden w-44 shrink-0 md:flex",
  email: "hidden w-56 shrink-0 lg:flex",
  title: "hidden w-44 shrink-0 xl:flex",
  status: "hidden w-28 shrink-0 sm:flex",
  updated: "w-24 shrink-0 justify-end",
};

const ENTITY_COLS = {
  name: "flex-1 min-w-[160px]",
  industry: "hidden w-44 shrink-0 md:flex",
  domain: "hidden w-48 shrink-0 lg:flex",
  contacts: "hidden w-24 shrink-0 justify-end xl:flex",
  status: "hidden w-28 shrink-0 sm:flex",
  updated: "w-24 shrink-0 justify-end",
};

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
      searchPlaceholder="Smart search, describe who you want, then Enter…"
      searchText={(c) => [c.name, c.email, c.title, c.entity?.name, statusLabel(c.status)].filter(Boolean).join(" ")}
      sortOptions={sortOptions}
      hrefFor={(c) => `/crm/${c.id}`}
      columns={[
        { label: "Name", className: CONTACT_COLS.name },
        { label: "Company", className: CONTACT_COLS.company },
        { label: "Email", className: CONTACT_COLS.email },
        { label: "Job title", className: CONTACT_COLS.title },
        { label: "Status", className: CONTACT_COLS.status },
        { label: "Updated", className: CONTACT_COLS.updated },
      ]}
      renderRow={(c, score) => (
        <>
          <div className={cn(CELL, CONTACT_COLS.name)}>
            <CrmAvatar src={c.imageUrl} label={c.name || c.email} shape="circle" size={20} />
            <span className="truncate font-medium text-foreground">{c.name || c.email || "Unnamed contact"}</span>
            <FitChip score={score} />
          </div>
          <div className={cn(CELL, CONTACT_COLS.company)}>
            {c.entity?.name && <RecordChip label={c.entity.name} shape="square" />}
          </div>
          <div className={cn(CELL, CONTACT_COLS.email)}>
            {c.email && <span className="truncate text-muted-foreground">{c.email}</span>}
          </div>
          <div className={cn(CELL, CONTACT_COLS.title)}>
            {c.title && <span className="truncate text-muted-foreground">{c.title}</span>}
          </div>
          <div className={cn(CELL, CONTACT_COLS.status)}>
            <Badge variant={statusColor(c.status) as Parameters<typeof Badge>[0]["variant"]}>{statusLabel(c.status)}</Badge>
          </div>
          <div className={cn(CELL, CONTACT_COLS.updated)}>
            <span className="text-muted-foreground tabular-nums">{new Date(c.updatedAt).toLocaleDateString()}</span>
          </div>
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
    { id: "location", label: "Location A-Z", cmp: (a, b) => (a.location ?? "~").localeCompare(b.location ?? "~") },
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
      searchPlaceholder="Smart search, describe the companies you want, then Enter…"
      searchText={(e) => [e.name, e.industry, e.domain, statusLabel(e.status)].filter(Boolean).join(" ")}
      sortOptions={sortOptions}
      hrefFor={(e) => `/crm/entity/${e.id}`}
      columns={[
        { label: "Name", className: ENTITY_COLS.name },
        { label: "Industry", className: ENTITY_COLS.industry },
        { label: "Domain", className: ENTITY_COLS.domain },
        { label: "Contacts", className: ENTITY_COLS.contacts },
        { label: "Status", className: ENTITY_COLS.status },
        { label: "Updated", className: ENTITY_COLS.updated },
      ]}
      renderRow={(e, score) => (
        <>
          <div className={cn(CELL, ENTITY_COLS.name)}>
            <CrmAvatar src={e.logoUrl} label={e.name} shape="square" size={20} />
            <span className="truncate font-medium text-foreground">{e.name}</span>
            <FitChip score={score} />
          </div>
          <div className={cn(CELL, ENTITY_COLS.industry)}>
            {e.industry && <span className="truncate text-muted-foreground">{e.industry}</span>}
          </div>
          <div className={cn(CELL, ENTITY_COLS.domain)}>
            {e.domain && <span className="truncate text-muted-foreground">{e.domain}</span>}
          </div>
          <div className={cn(CELL, ENTITY_COLS.contacts)}>
            <span className="text-muted-foreground tabular-nums">{e._count.contacts} contact{e._count.contacts === 1 ? "" : "s"}</span>
          </div>
          <div className={cn(CELL, ENTITY_COLS.status)}>
            <Badge variant={statusColor(e.status) as Parameters<typeof Badge>[0]["variant"]}>{statusLabel(e.status)}</Badge>
          </div>
          <div className={cn(CELL, ENTITY_COLS.updated)}>
            <span className="text-muted-foreground tabular-nums">{new Date(e.updatedAt).toLocaleDateString()}</span>
          </div>
        </>
      )}
    />
  );
}
