"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, KeyRound } from "lucide-react";
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
    <section className="rounded-[8px] border border-border bg-background">
      <header className="flex h-10 items-center justify-between border-b border-border px-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Phone className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
          Calls
        </h2>
      </header>
      <div className="p-3">
        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-[4px] bg-muted" />
            ))}
          </div>
        ) : !data?.connected ? (
          <div className="rounded-[8px] border border-dashed border-input px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">AgentPhone not connected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your AgentPhone API key so agents can call this contact and log every call here.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/settings">
                <KeyRound className="h-3.5 w-3.5" strokeWidth={1.6} />
                Add API key in settings
              </Link>
            </Button>
          </div>
        ) : data.error ? (
          <p className="text-sm text-muted-foreground">{data.error}</p>
        ) : (data.calls?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No calls with this contact yet.</p>
        ) : (
          <div className="-my-1 divide-y divide-border">
            {data.calls!.map((c) => (
              <div key={c.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">
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
                {c.recordingUrl && c.recordingUrl.startsWith("https://") && (
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
      </div>
    </section>
  );
}
