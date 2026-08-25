"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Thread = {
  id: string;
  subject: string;
  preview?: string;
  updatedAt?: string;
  from?: string;
};

type Resp = {
  connected: boolean;
  threads?: Thread[];
  note?: string;
  error?: string;
};

export function ContactAgentMail({ contactId }: { contactId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contacts/${contactId}/emails`)
      .then((r) => r.json())
      .then((d: Resp) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ connected: true, error: "Couldn't load AgentMail." }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contactId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email
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
          // ── Not connected ──
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <p className="font-brand text-sm text-foreground">AgentMail not connected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your AgentMail API key to see email threads with this contact here.
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
        ) : (data.threads?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.note ?? "No email threads with this contact yet."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {data.threads!.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{t.subject}</p>
                  {t.preview && (
                    <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{t.preview}</p>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {t.from && <span className="truncate">{t.from}</span>}
                    {t.updatedAt && <span>· {new Date(t.updatedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
