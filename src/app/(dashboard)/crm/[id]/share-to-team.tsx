"use client";

/**
 * ShareToTeam - copy this personal contact into a team workspace, with its
 * enrichment, history, and provenance. Rendered only when the viewer belongs
 * to at least one team and is looking at their PERSONAL CRM.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Team = { workspaceId: string; name: string };

export function ShareToTeam({ contactId, teams }: { contactId: string; teams: Team[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [includeMessages, setIncludeMessages] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function share(workspaceId: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, includeMessages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to share.");
        return;
      }
      setResult(
        data.merged
          ? "Merged into an existing team contact (empty fields filled, history attached)."
          : "Shared to the team with enrichment, history, and provenance.",
      );
      setOpen(false);
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (teams.length === 0) return null;

  return (
    <div className="space-y-2">
      {!open ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Share to team
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-border bg-card/50 p-3">
          <p className="text-xs text-muted-foreground">
            Copies this contact (and its company, enrichment, and history) into
            the team CRM. Your personal record stays yours.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeMessages}
              onChange={(e) => setIncludeMessages(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Include emails, calls, and social messages
          </label>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <Button
                key={t.workspaceId}
                size="sm"
                disabled={busy}
                onClick={() => share(t.workspaceId)}
              >
                {busy ? "Sharing..." : `Share to ${t.name}`}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {result && <p className="text-sm text-muted-foreground">{result}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
