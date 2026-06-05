"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EntityActions({
  entityId,
  hasDomain,
}: {
  entityId: string;
  hasDomain: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function enrich() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/entities/${entityId}/enrich`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
      } else {
        setMsg(data.error || "Enrichment failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  // Deep-research decision makers at this company (Exa) and add the ones we
  // don't already have as linked contacts.
  async function spawnContacts() {
    setSpawning(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/entities/${entityId}/spawn-contacts`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(
          data.created > 0
            ? `Added ${data.created} contact${data.created === 1 ? "" : "s"}${data.skipped ? ` · ${data.skipped} already known` : ""}`
            : "No new contacts found."
        );
        if (data.created > 0) router.refresh();
      } else {
        setMsg(data.error || "Couldn't research contacts.");
      }
    } finally {
      setSpawning(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this entity? Its contacts will be unlinked, not deleted."))
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/entities/${entityId}`, { method: "DELETE" });
      if (res.ok) router.push("/crm?tab=entities");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={spawnContacts}
          disabled={spawning || busy}
          title="Research decision makers and add the ones you don't have"
        >
          <UserPlus className="mr-1 h-4 w-4" />
          {spawning ? "Researching…" : "Spawn contacts"}
        </Button>
        <Button
          variant="glow"
          size="sm"
          onClick={enrich}
          disabled={busy || spawning || !hasDomain}
          title={hasDomain ? "Enrich this company" : "Add a domain to enrich"}
        >
          <Sparkles className="mr-1 h-4 w-4" />
          {busy ? "Enriching…" : "Enrich"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={remove}
          disabled={busy || spawning}
          aria-label="Delete entity"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
