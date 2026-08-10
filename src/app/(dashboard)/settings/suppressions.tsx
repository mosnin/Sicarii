"use client";

/**
 * SuppressionManager - the operator's opt-out ledger, made visible and editable.
 *
 * The acceptable-use policy promises operators "honor opt-outs." That promise
 * is only real if there is a place to see and manage the list. This is it: add
 * an address or a whole domain, see what is blocked and why, and remove an
 * entry when a block was a mistake. The list is enforced everywhere a send or a
 * dial happens, so a row here is a hard guarantee, not a preference.
 *
 * Exported, not wired: the settings page composes it.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Scope = "INBOUND" | "OUTBOUND" | "ALL";
type Item = { kind: "email" | "domain"; value: string; scope: Scope; reason: string | null; createdAt: string };

export function SuppressionManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suppressions");
      const data = await res.json();
      setItems(data.suppressions ?? []);
    } catch {
      setError("Could not load the suppression list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    const raw = value.trim().toLowerCase();
    if (!raw) return;
    setBusy(true);
    setError(null);
    // An entry with an @ is an email; otherwise treat it as a domain.
    const body = raw.includes("@") ? { email: raw } : { domain: raw.replace(/^@/, "") };
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(typeof d.error === "string" ? d.error : "Could not add that entry.");
      } else {
        setValue("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }, [value, load]);

  const remove = useCallback(
    async (item: Item) => {
      const q = item.kind === "email" ? `email=${encodeURIComponent(item.value)}` : `domain=${encodeURIComponent(item.value)}`;
      await fetch(`/api/suppressions?${q}`, { method: "DELETE" });
      await load();
    },
    [load],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Do not contact</CardTitle>
        <CardDescription>
          Addresses and domains here are never emailed or called, by you or your agents. This is the opt-out list the
          law and your acceptable-use policy require, enforced on every send and dial.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="person@example.com or example.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
            aria-label="Email or domain to suppress"
          />
          <Button onClick={() => void add()} disabled={busy || !value.trim()}>
            {busy ? "Adding" : "Add"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing suppressed yet. Anyone who unsubscribes, asks to stop, or bounces hard lands here automatically.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {items.map((item) => (
              <li key={`${item.kind}:${item.value}`} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{item.value}</span>
                    <Badge variant="secondary">{item.kind === "domain" ? "Domain" : "Email"}</Badge>
                    {item.scope !== "ALL" && <Badge variant="secondary">{item.scope.toLowerCase()}</Badge>}
                  </div>
                  {item.reason && <p className="truncate text-xs text-muted-foreground">{item.reason}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => void remove(item)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
