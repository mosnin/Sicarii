"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

// Shown on contacts with no company. Researches where they work, then links them
// to a matching entity (creating it if needed - never a duplicate).
export function MatchEntity({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function match() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/match-entity`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) router.refresh();
      else setErr(data.error || "Couldn't match a company.");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <p className="text-sm font-medium text-foreground">Not linked to a company</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Find where this person works and link them - we&apos;ll create the company if it&apos;s new.
      </p>
      <Button size="sm" className="mt-3" onClick={match} disabled={busy}>
        {busy ? (
          <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="mr-1.5 inline-flex">
            <RefreshCw className="h-3.5 w-3.5" />
          </motion.span>
        ) : (
          <Building2 className="mr-1.5 h-3.5 w-3.5" />
        )}
        {busy ? "Matching…" : "Match to company"}
      </Button>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
