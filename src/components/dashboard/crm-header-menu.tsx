"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Map, Download, Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Three-dots menu on the CRM entities tab. Hosts the optional Map view, CSV
// exports, and a one-tap cleanup for auto-imported (Synthoz webhook) junk records.
export function CrmHeaderMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Navigating to the export endpoint downloads the CSV attachment in place.
  function exportCsv(href: string) {
    setOpen(false);
    window.location.href = href;
  }

  async function cleanup() {
    if (
      !confirm(
        "Delete all auto-imported records (from the Synthoz webhook)? This removes the junk companies and contacts that were imported automatically. Records you added or discovered are kept.",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/cleanup/imported", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(`Removed ${d.deletedEntities ?? 0} companies and ${d.deletedContacts ?? 0} contacts.`);
        setOpen(false);
        router.refresh();
      } else {
        alert(d.error ?? "Cleanup failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" strokeWidth={1.6} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <button type="button" aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-[8px] border border-border bg-background p-1 shadow-lg"
            >
              <Link
                href="/crm/map"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 h-8 rounded-[4px] px-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Map className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                Map view
              </Link>
              <button
                type="button"
                onClick={() => exportCsv("/api/contacts/export")}
                className="flex w-full items-center gap-2 h-8 rounded-[4px] px-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Download className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                Export contacts (CSV)
              </button>
              <button
                type="button"
                onClick={() => exportCsv("/api/entities/export")}
                className="flex w-full items-center gap-2 h-8 rounded-[4px] px-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Download className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                Export companies (CSV)
              </button>
              <button
                type="button"
                onClick={cleanup}
                disabled={busy}
                className="flex w-full items-center gap-2 h-8 rounded-[4px] px-2 text-left text-sm text-destructive transition-colors hover:bg-muted disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={1.6} />}
                Clean up imported junk
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
