"use client";

/**
 * LogSocialMessage - inline form to record a social media message (DM, comment,
 * connection note) on the contact, keeping social conversations tracked next to
 * email. Collapsed to a single button until needed.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const CHANNELS = [
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "X", label: "X" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "OTHER", label: "Other" },
] as const;

const selectClass =
  "flex h-9 rounded-lg border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LogSocialMessage({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = String(form.get("body") ?? "").trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/social-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: String(form.get("channel") ?? "LINKEDIN"),
          direction: String(form.get("direction") ?? "OUTBOUND"),
          body,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to log message.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Log social message
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card/50 p-3">
      <div className="flex flex-wrap gap-2">
        <select name="channel" defaultValue="LINKEDIN" className={selectClass} aria-label="Channel">
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select name="direction" defaultValue="OUTBOUND" className={selectClass} aria-label="Direction">
          <option value="OUTBOUND">Sent by us</option>
          <option value="INBOUND">Received</option>
        </select>
      </div>
      <Textarea
        name="body"
        rows={3}
        placeholder="Paste or summarize the message..."
        autoFocus
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving..." : "Log message"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
