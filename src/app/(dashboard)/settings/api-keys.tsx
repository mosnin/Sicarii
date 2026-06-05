"use client";

import { useEffect, useState } from "react";
import { Trash2, Copy, Check, Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch("/api/keys");
    if (res.ok) setKeys((await res.json()).keys ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreated(data.plaintext);
        setName("");
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Connected agents using it will lose access."))
      return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    load();
  }

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp/mcp`
      : "/api/mcp/mcp";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent access — API keys</CardTitle>
        <CardDescription>
          Connect agents (OpenClaw, Hermes, Claude Cowork) to your CRM over MCP.
          Point them at <code className="text-foreground">{mcpUrl}</code> with an
          API key as a Bearer token.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {created && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm font-medium">
              Copy your key now — you won&apos;t see it again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-3 py-2 text-sm">
                {created}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(created);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                aria-label="Copy key"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setCreated(null)}
            >
              Done
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Key name (e.g. OpenClaw)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button variant="glow" onClick={create} disabled={busy || !name.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            Create
          </Button>
        </div>

        {keys.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No keys yet. Create one to connect an agent.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    {k.revokedAt ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {k.prefix}…{k.last4} ·{" "}
                    {k.lastUsedAt
                      ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : "never used"}
                  </p>
                </div>
                {!k.revokedAt && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => revoke(k.id)}
                    aria-label="Revoke key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
