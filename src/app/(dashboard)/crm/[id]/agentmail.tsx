"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, KeyRound } from "lucide-react";
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
    <section className="rounded-[8px] border border-border bg-background">
      <header className="flex h-10 items-center justify-between border-b border-border px-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Mail className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
          Email
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
          // Not connected
          <div className="rounded-[8px] border border-dashed border-input px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">AgentMail not connected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your AgentMail API key to see email threads with this contact here.
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
        ) : (data.threads?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.note ?? "No email threads with this contact yet."}
          </p>
        ) : (
          <div className="-my-1 divide-y divide-border">
            {data.threads!.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.subject}</p>
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
      </div>
    </section>
  );
}
