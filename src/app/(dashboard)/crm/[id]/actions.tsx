"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_STATUSES, statusLabel } from "@/lib/contact-status";

export function ContactActions({
  contactId,
  currentStatus,
}: {
  contactId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [busy, setBusy] = useState(false);

  async function updateStatus(next: string) {
    setStatus(next);
    setBusy(true);
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this contact? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "DELETE",
      });
      if (res.ok) router.push("/crm");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        disabled={busy}
        onChange={(e) => updateStatus(e.target.value)}
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {CONTACT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="icon"
        onClick={remove}
        disabled={busy}
        aria-label="Delete contact"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
