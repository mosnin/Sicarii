"use client";

/**
 * ConnectionsManager - connect the operator's own Gmail and Google Calendar.
 *
 * The copy here is doing real work, not decoration. Connecting a mailbox is
 * the largest single act of trust the product ever asks for, so this surface
 * has to be honest about three things without being asked:
 *
 *   1. Sync is FORWARD-ONLY. Nothing from before the moment you connect is
 *      imported. Saying so up front is what stops the "is it about to read ten
 *      years of my email" hesitation that kills the connect.
 *   2. Auto-creating contacts is OFF. Creating a contact is a decision, not a
 *      side effect of syncing.
 *   3. When a connection dies, it says so and says what to do. A silently dead
 *      sync is worse than no sync, because the CRM keeps looking current.
 *
 * Exported, not wired: the settings page composes it.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Provider = "GMAIL" | "GOOGLE_CALENDAR";

type Connection = {
  id: string;
  provider: Provider;
  status: "PENDING" | "ACTIVE" | "ERROR" | "REVOKED";
  accountEmail: string | null;
  lastError: string | null;
  connectedAt: string | null;
  needsReauth: boolean;
  sync: {
    status: "IDLE" | "SYNCING" | "ERROR" | "PAUSED";
    syncFromAt: string;
    lastSyncedAt: string | null;
    lastError: string | null;
    autoCreateContacts: boolean;
  } | null;
  triggers: { slug: string; active: boolean; lastEventAt: string | null; lastError: string | null }[];
};

const PROVIDER_LABEL: Record<Provider, string> = {
  GMAIL: "Gmail",
  GOOGLE_CALENDAR: "Google Calendar",
};

const PROVIDER_BLURB: Record<Provider, string> = {
  GMAIL:
    "Threads and replies are filed against the right contact automatically, and a reply moves that contact out of your follow-up queue.",
  GOOGLE_CALENDAR:
    "Meetings and their attendees land on the contact record, so a booked call counts as engagement without anyone logging it.",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "never";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ConnectionsManager() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [available, setAvailable] = useState<Provider[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      if (!res.ok) return;
      const data = await res.json();
      setConnections(data.connections ?? []);
      setAvailable(data.available ?? []);
      setConfigured(Boolean(data.configured));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function connect(provider: Provider) {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch("/api/connections/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) {
        setError(data.error ?? "Could not start the connection.");
        setBusy(null);
        return;
      }
      // Straight to Google's consent screen. The row is already persisted, so
      // closing the tab here leaves a recoverable state, not an orphan.
      window.location.href = data.redirectUrl;
    } catch {
      setError("Could not start the connection.");
      setBusy(null);
    }
  }

  async function disconnect(connection: Connection) {
    const label = PROVIDER_LABEL[connection.provider];
    if (
      !confirm(
        `Disconnect ${label}? Syncing stops immediately. Threads and meetings already in your CRM are kept.`,
      )
    ) {
      return;
    }
    setBusy(connection.id);
    try {
      await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleAutoCreate(connection: Connection, next: boolean) {
    setBusy(connection.id);
    // Optimistic: the toggle should feel instant, and a failed PATCH reloads
    // the truth from the server a moment later.
    setConnections((prev) =>
      prev.map((c) => (c.id === connection.id && c.sync ? { ...c, sync: { ...c.sync, autoCreateContacts: next } } : c)),
    );
    try {
      await fetch(`/api/connections/${connection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoCreateContacts: next }),
      });
    } finally {
      await load();
      setBusy(null);
    }
  }

  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const providers: Provider[] = available.length ? available : ["GMAIL", "GOOGLE_CALENDAR"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mailbox and calendar</CardTitle>
        <CardDescription>
          Connect your own Gmail and Google Calendar so replies and meetings land on the right
          contact by themselves. Sync starts the moment you connect and never reaches backwards:
          nothing older than that is imported.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!configured && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            Mailbox sync is not configured on this deployment yet.
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading connections...</p>
        ) : (
          providers.map((provider) => {
            const connection = byProvider.get(provider);
            const active = connection?.status === "ACTIVE";
            const working = busy === provider || busy === connection?.id;

            return (
              <div key={provider} className="rounded-2xl bg-muted/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{PROVIDER_LABEL[provider]}</p>
                      {connection && (
                        <Badge
                          variant={
                            active ? "success" : connection.needsReauth ? "destructive" : "secondary"
                          }
                        >
                          {active
                            ? "Connected"
                            : connection.status === "PENDING"
                              ? "Awaiting consent"
                              : connection.status === "REVOKED"
                                ? "Disconnected"
                                : "Needs attention"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
                      {PROVIDER_BLURB[provider]}
                    </p>
                    {active && connection?.accountEmail && (
                      <p className="mt-1 text-sm text-muted-foreground">{connection.accountEmail}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {active ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={working}
                        onClick={() => disconnect(connection!)}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={working || !configured || !available.includes(provider)}
                        onClick={() => connect(provider)}
                      >
                        {connection?.needsReauth ? "Reconnect" : "Connect"}
                      </Button>
                    )}
                  </div>
                </div>

                {connection?.needsReauth && (
                  <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2">
                    <p className="text-sm font-medium text-destructive">
                      Sync has stopped. Reconnect to start it again.
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {connection.lastError ??
                        connection.sync?.lastError ??
                        "The connection expired or was revoked at Google."}{" "}
                      Nothing that arrived while it was down was imported, so reconnect when you can.
                    </p>
                  </div>
                )}

                {connection?.sync && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Syncing since</dt>
                        <dd className="text-foreground">{formatWhen(connection.sync.syncFromAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Last synced</dt>
                        <dd className="text-foreground">{formatWhen(connection.sync.lastSyncedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Checks</dt>
                        <dd className="text-foreground">
                          {connection.triggers.some((t) => t.active) ? "Every 15 minutes" : "Paused"}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Create contacts automatically
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Off by default. Leave it off and sync only files mail against people who
                          are already in your CRM. Turn it on and anyone new you exchange mail with
                          becomes a contact, except your own addresses, automated senders and
                          anything you have suppressed.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={connection.sync.autoCreateContacts}
                        aria-label="Create contacts automatically from synced mail"
                        disabled={working}
                        onClick={() => toggleAutoCreate(connection, !connection.sync!.autoCreateContacts)}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          connection.sync.autoCreateContacts ? "bg-primary" : "bg-muted-foreground/30",
                          working && "opacity-70",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-all",
                            connection.sync.autoCreateContacts ? "ml-[22px]" : "ml-0.5",
                          )}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
