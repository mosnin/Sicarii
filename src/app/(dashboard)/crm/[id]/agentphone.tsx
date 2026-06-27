"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Call = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  toNumber?: string | null;
  fromNumber?: string | null;
  status?: string | null;
  durationSec?: number | null;
  summary?: string | null;
  transcript?: string | null;
  recordingUrl?: string | null;
  startedAt?: string | null;
};

type Resp = {
  connected: boolean;
  calls?: Call[];
  error?: string;
};

function duration(sec?: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export function ContactAgentPhone({ contactId }: { contactId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contacts/${contactId}/calls`)
      .then((r) => r.json())
      .then((d: Resp) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ connected: true, error: "Couldn't load calls." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          Calls
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : !data?.connected ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <p className="font-brand text-sm text-foreground">AgentPhone not connected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your AgentPhone API key so agents can call this contact and log every call here.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/settings">
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                Add API key in settings
              </Link>
            </Button>
          </div>
        ) : data.error ? (
          <p className="text-sm text-muted-foreground">{data.error}</p>
        ) : (data.calls?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No calls with this contact yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.calls!.map((c) => (
              <div key={c.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">
                      {c.direction === "OUTBOUND" ? "Outbound" : "Inbound"}
                    </span>
                    <span className="text-muted-foreground">
                      {c.direction === "OUTBOUND" ? c.toNumber : c.fromNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.status && <span className="capitalize">{c.status}</span>}
                    {duration(c.durationSec) && <span>· {duration(c.durationSec)}</span>}
                    {c.startedAt && <span>· {new Date(c.startedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                {(c.summary || c.transcript) && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-3">
                    {c.summary ?? c.transcript}
                  </p>
                )}
                {c.recordingUrl && (
                  <a
                    href={c.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                  >
                    Recording
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
