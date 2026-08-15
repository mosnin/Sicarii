"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo-mark";

type Workspace = {
  workspaceId: string;
  name: string;
};

type Quota = { used: number; allowed: number | null; unlimited: boolean };

export function WorkspaceSwitcher({
  activeName,
  activeId,
  homeName,
  variant = "header",
}: {
  activeName: string;
  activeId: string | null;
  homeName: string;
  variant?: "header" | "sidebar";
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Workspace[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/workspaces").then((r) => r.json()).catch(() => ({}));
    setItems(d.workspaces ?? []);
    setQuota(d.quota ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function switchTo(workspaceId: string | null) {
    setBusy(workspaceId ?? "home");
    setMsg(null);
    try {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error ?? "Couldn't switch.");
        return;
      }
      window.location.assign("/dashboard");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!newName.trim()) return;
    setBusy("create");
    setMsg(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error ?? "Couldn't create workspace.");
        return;
      }
      await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: d.workspace.workspaceId }),
      });
      window.location.assign("/dashboard");
    } finally {
      setBusy(null);
    }
  }

  const canCreate = Boolean(
    quota?.unlimited || (quota && quota.allowed !== null && quota.used < quota.allowed),
  );
  const sidebar = variant === "sidebar";

  return (
    <div className={cn("relative", sidebar && "w-full")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        className={cn(
          "flex items-center gap-2 text-left transition-colors",
          sidebar
            ? "w-full rounded-lg px-1 py-1 hover:bg-foreground/5"
            : "max-w-[16rem] rounded-full border border-border/70 bg-background/60 px-3 py-1.5 backdrop-blur-md hover:bg-accent",
        )}
      >
        <LogoMark className={sidebar ? "h-6 w-6 shrink-0" : "h-5 w-5 shrink-0"} />
        <span
          className={cn(
            "min-w-0 truncate font-brand font-bold text-foreground",
            sidebar ? "text-base" : "text-sm",
          )}
        >
          {activeName}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "z-50 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-xl",
              sidebar ? "absolute left-0 top-full mt-2 w-[17.5rem]" : "absolute right-0 mt-2 w-72",
            )}
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Your businesses
            </p>
            <MenuRow
              label={homeName}
              active={activeId === null}
              busy={busy === "home"}
              onClick={() => switchTo(null)}
            />
            {items.map((w) => (
              <MenuRow
                key={w.workspaceId}
                label={w.name}
                active={activeId === w.workspaceId}
                busy={busy === w.workspaceId}
                onClick={() => switchTo(w.workspaceId)}
              />
            ))}

            <div className="my-1.5 h-px bg-border" />

            {creating ? (
              <div className="space-y-2 px-1.5 py-1">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  placeholder="Business name"
                  autoFocus
                  className="h-9 w-full rounded-full border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={create}
                    disabled={busy !== null || !newName.trim()}
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create and open"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setMsg(null); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (canCreate ? setCreating(true) : setMsg("Upgrade your plan to add another business."))}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                New workspace
              </button>
            )}
            {msg && <p className="px-2.5 py-1.5 text-xs text-destructive">{msg}</p>}
          </div>
        </>
      )}
    </div>
  );
}

function MenuRow({
  label,
  active,
  busy,
  onClick,
}: {
  label: string;
  active: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : active ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
      ) : null}
    </button>
  );
}
