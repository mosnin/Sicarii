"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FloatIn } from "@/components/ui/float-in";
import { cn } from "@/lib/utils";

/* ---------- Types passed in from the server ---------- */

export type CrmContact = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  status: string;
  updatedAt: string; // serialised Date
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

/* -------- Status badge helpers -------- */

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
    NEW: "New",
    ENRICHED: "Enriched",
    LEAD: "Lead",
    CONTACTED: "Contacted",
    REPLIED: "Replied",
    QUALIFIED: "Qualified",
    WON: "Won",
    LOST: "Lost",
    ARCHIVED: "Archived",
  };
  return map[status] ?? status;
}

/* -------- Bulk-select primitives -------- */

function RowCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary/50"
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </button>
  );
}

function useBulkSelect(ids: string[], endpoint: string) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();

  const allSelected = ids.length > 0 && selected.size === ids.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(ids));

  const clear = () => setSelected(new Set());

  async function remove() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (res.ok) {
        clear();
        startTransition(() => router.refresh());
      }
    } finally {
      setDeleting(false);
    }
  }

  return { selected, allSelected, toggle, toggleAll, clear, remove, deleting };
}

function BulkHeader({
  total,
  count,
  allSelected,
  onToggleAll,
  onClear,
  onDelete,
  deleting,
  noun,
}: {
  total: number;
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  deleting: boolean;
  noun: string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex h-9 items-center justify-between px-1">
      <div className="flex items-center gap-2.5">
        <RowCheckbox checked={allSelected} onToggle={onToggleAll} label="Select all" />
        <span className="text-sm text-muted-foreground">
          {count > 0 ? `${count} selected` : "Select all"}
        </span>
      </div>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="flex items-center gap-2"
          >
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Delete {count} {count === 1 ? noun : `${noun}s`}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------- Floating row card (checkbox + link) --------- */

function RowCard({
  href,
  selected,
  onToggle,
  delay,
  children,
}: {
  href: string;
  selected: boolean;
  onToggle: () => void;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <FloatIn delay={delay}>
      <div className="group flex items-center gap-3">
        <RowCheckbox checked={selected} onToggle={onToggle} label="Select row" />
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

/* --------- Contact rows --------- */

export function ContactRows({ contacts }: { contacts: CrmContact[] }) {
  const { selected, allSelected, toggle, toggleAll, clear, remove, deleting } =
    useBulkSelect(
      contacts.map((c) => c.id),
      "/api/contacts"
    );

  return (
    <div className="space-y-2.5">
      <BulkHeader
        total={contacts.length}
        count={selected.size}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={clear}
        onDelete={remove}
        deleting={deleting}
        noun="contact"
      />
      {contacts.map((c, i) => (
        <RowCard
          key={c.id}
          href={`/crm/${c.id}`}
          selected={selected.has(c.id)}
          onToggle={() => toggle(c.id)}
          delay={0.05 + i * 0.04}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {c.name || c.email || "Unnamed contact"}
              </span>
              <Badge variant={statusColor(c.status) as Parameters<typeof Badge>[0]["variant"]}>
                {statusLabel(c.status)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {c.entity?.name && <span className="truncate">{c.entity.name}</span>}
              {c.email && <span className="truncate max-w-[200px]">{c.email}</span>}
              {c.title && <span className="truncate">{c.title}</span>}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(c.updatedAt).toLocaleDateString()}
          </span>
        </RowCard>
      ))}
    </div>
  );
}

/* --------- Entity rows --------- */

export function EntityRows({ entities }: { entities: CrmEntity[] }) {
  const { selected, allSelected, toggle, toggleAll, clear, remove, deleting } =
    useBulkSelect(
      entities.map((e) => e.id),
      "/api/entities"
    );

  return (
    <div className="space-y-2.5">
      <BulkHeader
        total={entities.length}
        count={selected.size}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={clear}
        onDelete={remove}
        deleting={deleting}
        noun="company"
      />
      {entities.map((e, i) => (
        <RowCard
          key={e.id}
          href={`/crm/entity/${e.id}`}
          selected={selected.has(e.id)}
          onToggle={() => toggle(e.id)}
          delay={0.05 + i * 0.04}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-foreground">{e.name}</span>
              <Badge variant={statusColor(e.status) as Parameters<typeof Badge>[0]["variant"]}>
                {statusLabel(e.status)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {e.industry && <span className="truncate">{e.industry}</span>}
              {e.domain && <span className="truncate">{e.domain}</span>}
              <span>
                {e._count.contacts} contact{e._count.contacts === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(e.updatedAt).toLocaleDateString()}
          </span>
        </RowCard>
      ))}
    </div>
  );
}
