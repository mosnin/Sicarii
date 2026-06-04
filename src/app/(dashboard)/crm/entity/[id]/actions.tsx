"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
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
          variant="glow"
          size="sm"
          onClick={enrich}
          disabled={busy || !hasDomain}
          title={hasDomain ? "Enrich via Synthoz" : "Add a domain to enrich"}
        >
          <Sparkles className="mr-1 h-4 w-4" />
          {busy ? "Enriching…" : "Enrich"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={remove}
          disabled={busy}
          aria-label="Delete entity"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {msg && <p className="text-xs text-destructive">{msg}</p>}
    </div>
  );
}
