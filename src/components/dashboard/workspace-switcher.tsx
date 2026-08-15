"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Workspace = {
  workspaceId: string;
  name: string;
  role: string;
  clerkId: string;
  native: boolean;
};

export function WorkspaceSwitcher({
  activeName,
  isWorkspace,
}: {
  activeName: string;
  isWorkspace: boolean;
}) {
  const router = useRouter();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Workspace[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/workspaces").then((r) => r.json()).catch(() => ({}));
    setItems(d.workspaces ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function switchTo(workspaceId: string | null, clerkId?: string, native?: boolean) {
    setBusy(workspaceId ?? "personal");
    try {
      if (clerkId && !native && clerkId.startsWith("org_")) {
        try {
          await clerk.setActive({ organization: clerkId });
        } catch {
          /* Clerk orgs may be disabled; cookie path still works */
        }
      } else {
        try {
          await clerk.setActive({ organization: null });
        } catch {
          /* personal is the default when orgs are off */
        }
      }
      await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="max-w-[11rem] truncate rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-md hover:bg-accent"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {isWorkspace ? activeName : "Personal"}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-xl">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Workspace
            </p>
            <button
              type="button"
              onClick={() => switchTo(null)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted",
                !isWorkspace ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Personal
              {busy === "personal" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </button>
            {items.map((w) => (
              <button
                key={w.workspaceId}
                type="button"
                onClick={() => switchTo(w.workspaceId, w.clerkId, w.native)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted",
                  isWorkspace && activeName === w.name ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="truncate">{w.name}</span>
                {busy === w.workspaceId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </button>
            ))}
            <a
              href="/settings#workspaces"
              className="mt-1 block rounded-xl px-2.5 py-2 text-xs text-primary hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              Manage workspaces
            </a>
          </div>
        </>
      )}
    </div>
  );
}
