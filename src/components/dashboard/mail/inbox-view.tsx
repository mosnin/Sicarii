"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw, MailOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mailFetch, relTime, type InboundClass, type MailboxRow, type MessageRow } from "./types";

const CLASS_BADGE: Record<InboundClass, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "primary" }> = {
  REPLY: { label: "Reply", variant: "success" },
  AUTO_REPLY: { label: "Auto-reply", variant: "secondary" },
  BOUNCE: { label: "Bounce", variant: "destructive" },
  UNSUBSCRIBE: { label: "Opt-out", variant: "warning" },
  OUT_OF_OFFICE: { label: "Out of office", variant: "secondary" },
  WARMUP: { label: "Warmup", variant: "secondary" },
  OTHER: { label: "Other", variant: "secondary" },
};

type Filter = "all" | "replies" | "bounces" | "outbound";

/** Unified inbox across all agent mailboxes, with in-place thread expansion. */
export function InboxView({ mailboxes }: { mailboxes: MailboxRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<MessageRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const p = new URLSearchParams({ limit: "60" });
      if (filter === "replies") {
        p.set("direction", "INBOUND");
        p.set("classification", "REPLY");
      } else if (filter === "bounces") {
        p.set("direction", "INBOUND");
        p.set("classification", "BOUNCE");
      } else if (filter === "outbound") p.set("direction", "OUTBOUND");
      const r = await mailFetch<{ messages: MessageRow[] }>(`/api/mail/messages?${p.toString()}`);
      setMessages(r.messages.filter((m) => !m.isWarmup));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load messages.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function open(id: string) {
    if (openId === id) {
      setOpenId(null);
      setThread(null);
      return;
    }
    setOpenId(id);
    setThread(null);
    try {
      const r = await mailFetch<{ messages: MessageRow[] }>(`/api/mail/messages/${id}/thread`);
      setThread(r.messages);
    } catch {
      setThread([]);
    }
  }

  const byMailbox = new Map(mailboxes.map((m) => [m.id, m.address]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-1 text-xs">
          {(
            [
              ["all", "All"],
              ["replies", "Replies"],
              ["bounces", "Bounces"],
              ["outbound", "Sent"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-md px-3 py-1.5 transition-colors", filter === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="ml-auto">
          {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {err && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{err}</p>}

      {messages && messages.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <MailOpen className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-muted-foreground">
            {mailboxes.length === 0 ? "Add a mailbox and your agent's conversations will show up here." : "Nothing yet. Replies land here the moment they arrive, and your agent is notified through its webhook."}
          </p>
        </div>
      )}

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {(messages ?? []).map((m) => {
          const inbound = m.direction === "INBOUND";
          const cls = inbound && m.classification ? CLASS_BADGE[m.classification] : null;
          const isOpen = openId === m.id;
          return (
            <div key={m.id}>
              <button type="button" onClick={() => open(m.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
                {inbound ? <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-xs text-foreground">{inbound ? m.fromAddr : m.toAddr}</span>
                    {cls && <Badge variant={cls.variant}>{cls.label}</Badge>}
                    {!inbound && m.status === "FAILED" && <Badge variant="destructive">Failed</Badge>}
                    {m.contactId && (
                      <Link href={`/crm/${m.contactId}`} onClick={(e) => e.stopPropagation()} className="text-[11px] text-primary hover:underline">
                        contact
                      </Link>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-foreground">{m.subject || "(no subject)"}</p>
                  <p className="truncate text-xs text-muted-foreground">{(m.text ?? m.error ?? "").replace(/\s+/g, " ").slice(0, 140)}</p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                  <p>{relTime(m.receivedAt ?? m.sentAt ?? m.createdAt)}</p>
                  <p className="mt-0.5 max-w-[10rem] truncate font-mono">{byMailbox.get(m.mailboxId) ?? ""}</p>
                </div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-border/60 bg-background/60">
                    <div className="space-y-3 px-4 py-3">
                      {thread === null && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading thread
                        </p>
                      )}
                      {(thread ?? []).map((t) => (
                        <div key={t.id} className={cn("rounded-xl border p-3", t.direction === "INBOUND" ? "border-success/20 bg-success/5" : "border-border bg-card")}>
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-mono text-foreground">{t.fromAddr}</span> → <span className="font-mono">{t.toAddr}</span> · {relTime(t.receivedAt ?? t.sentAt ?? t.createdAt)}
                            {t.classifierNote ? ` · ${t.classifierNote}` : ""}
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">{t.subject || "(no subject)"}</p>
                          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">{t.text ?? t.error ?? ""}</pre>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
