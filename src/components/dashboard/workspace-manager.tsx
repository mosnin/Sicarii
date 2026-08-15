"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Workspace = {
  workspaceId: string;
  name: string;
  role: string;
  native: boolean;
  plan: string;
  creditsRemaining: number;
};

type Quota = { used: number; allowed: number | null; unlimited: boolean };

export function WorkspaceManager() {
  const router = useRouter();
  const [items, setItems] = useState<Workspace[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/workspaces").then((r) => r.json()).catch(() => ({}));
    setItems(d.workspaces ?? []);
    setQuota(d.quota ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error ?? "Couldn't create workspace.");
        return;
      }
      setName("");
      await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: d.workspace.workspaceId }),
      });
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this workspace and all of its CRM data? This cannot be undone.")) return;
    const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(d.error ?? "Couldn't delete workspace.");
      return;
    }
    await load();
    router.refresh();
  }

  const canCreate = quota?.unlimited || (quota && quota.allowed !== null && quota.used < quota.allowed);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Each workspace is its own CRM: contacts, lists, segments, and pipelines.
        Use one per business. {quota?.unlimited
          ? "Admin accounts have no workspace cap."
          : quota?.allowed === 0
            ? "Upgrade to create workspaces."
            : `You can have ${quota?.allowed ?? 0} workspace${quota?.allowed === 1 ? "" : "s"} on this plan.`}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme outbound"
          disabled={!canCreate}
        />
        <Button size="sm" onClick={create} disabled={busy || !name.trim() || !canCreate}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          New workspace
        </Button>
      </div>
      {msg && <p className="text-xs text-destructive">{msg}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No extra workspaces yet. Personal is always here.</p>
      ) : (
        <div className="divide-y divide-border">
          {items.map((w) => (
            <div key={w.workspaceId} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{w.name}</p>
                <p className="text-xs text-muted-foreground">
                  {w.plan} · {w.creditsRemaining.toLocaleString()} credits · {w.role}
                  {w.native ? "" : " · Clerk team"}
                </p>
              </div>
              {w.native && w.role === "admin" && (
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => remove(w.workspaceId)}>
                  Delete
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
