"use client";

import { useEffect, useState } from "react";
import { Trash2, Copy, Check, Plus } from "lucide-react";
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
    <section>
      <h2 className="text-base font-semibold text-foreground">Agent access - API keys</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect agents (OpenClaw, Hermes, Claude Cowork) to your CRM over MCP.
        Point them at <code className="font-mono text-muted-foreground">{mcpUrl}</code> with an
        API key as a Bearer token.
      </p>

      <div className="mt-3 space-y-3">
        {created && (
          <div className="rounded-[8px] border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium text-foreground">
              Copy your key now - you won&apos;t see it again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="h-8 flex-1 truncate rounded-[4px] border border-border bg-background px-2.5 font-mono text-sm leading-8">
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
                  <Check className="h-4 w-4" strokeWidth={1.6} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.6} />
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
          <Button onClick={create} disabled={busy || !name.trim()}>
            <Plus className="h-4 w-4" strokeWidth={1.6} />
            Create
          </Button>
        </div>

        {keys.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No keys yet. Create one to connect an agent.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[8px] border border-border bg-card">
            <table className="twenty-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Last used</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="font-medium text-foreground">{k.name}</td>
                    <td className="font-mono text-xs text-muted-foreground">
                      {k.prefix}…{k.last4}
                    </td>
                    <td>
                      {k.revokedAt ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {k.lastUsedAt
                        ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                        : "never used"}
                    </td>
                    <td className="w-10 text-right">
                      {!k.revokedAt && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => revoke(k.id)}
                          aria-label="Revoke key"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
