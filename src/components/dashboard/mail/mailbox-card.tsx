"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Loader2, Pause, Play, RefreshCw, Trash2, Flame, ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { mailFetch, relTime, type MailboxRow, type MailboxStatus } from "./types";

const STATUS_LABEL: Record<MailboxStatus, { label: string; variant: "success" | "warning" | "secondary" | "destructive" | "primary" }> = {
  PROVISIONING: { label: "Provisioning", variant: "secondary" },
  WARMING: { label: "Warming", variant: "warning" },
  ACTIVE: { label: "Active", variant: "success" },
  PAUSED: { label: "Paused", variant: "secondary" },
  DISABLED: { label: "Disabled", variant: "destructive" },
};

function healthTone(score: number): string {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

/** One mailbox: identity, health, today's budget, warmup progress, controls. */
export function MailboxCard({
  mailbox: m,
  delay = 0,
  onChanged,
}: {
  mailbox: MailboxRow;
  delay?: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cap, setCap] = useState(String(m.dailyCap));

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setErr(null);
    try {
      await mailFetch(`/api/mail/mailboxes/${m.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${m.address}? Its message history stays on the contacts; the mailbox stops sending immediately.`)) return;
    setBusy("delete");
    try {
      await mailFetch(`/api/mail/mailboxes/${m.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete.");
      setBusy(null);
    }
  }

  const st = STATUS_LABEL[m.status];
  const paused = m.status === "PAUSED";
  const coldPct = m.coldCapToday > 0 ? Math.min(100, Math.round((m.sentToday / m.coldCapToday) * 100)) : 0;
  const warmPct = Math.min(100, Math.round((m.warmupDay / 42) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-mono text-sm text-foreground">{m.address}</p>
            <Badge variant={st.variant}>{st.label}</Badge>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {m.provider === "AGENTMAIL" ? "AgentMail" : "SMTP"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.displayName ? `${m.displayName} · ` : ""}
            {m.sentTotal.toLocaleString()} sent lifetime · {m.bounces} bounces · {m.complaints} complaints · synced {relTime(m.lastSyncedAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("font-brand text-2xl tabular-nums", healthTone(m.healthScore))}>{m.healthScore}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">health</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Cold mail today
            </span>
            <span className="tabular-nums text-foreground">
              {m.sentToday} / {m.coldCapToday}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${coldPct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {m.coldCapToday === 0
              ? m.daysUntilColdAllowed > 0
                ? `Cold sends unlock in ${m.daysUntilColdAllowed} day${m.daysUntilColdAllowed === 1 ? "" : "s"} of warmup.`
                : paused
                  ? "Paused."
                  : m.healthScore < 50
                    ? "Health too low; sending is on hold."
                    : "No cold budget today."
              : `${m.coldRemainingToday} left today (cap ${m.dailyCap} when fully warmed).`}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Flame className="h-3.5 w-3.5" /> Warmup
            </span>
            <span className="tabular-nums text-foreground">
              {m.warmupEnabled ? `day ${m.warmupDay} / 42` : "off"}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", m.warmupEnabled ? "bg-warning" : "bg-muted-foreground/30")}
              style={{ width: `${m.warmupEnabled ? warmPct : 0}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {m.warmupSentToday} warmup sent today · {m.warmupSent} total · {m.warmupReplies} replies
            {m.warmupSpamSaved > 0 ? ` · ${m.warmupSpamSaved} rescued from spam` : ""}
          </p>
        </div>
      </div>

      {(m.lastError || err) && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {err ?? m.lastError}
            {!err && m.lastErrorAt ? ` (${relTime(m.lastErrorAt)})` : ""}
          </span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null || m.status === "PROVISIONING" || m.status === "DISABLED"}
          onClick={() => patch({ paused: !paused }, "pause")}
        >
          {busy === "pause" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : paused ? <Play className="mr-1 h-3.5 w-3.5" /> : <Pause className="mr-1 h-3.5 w-3.5" />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => patch({ warmupEnabled: !m.warmupEnabled }, "warmup")}>
          {busy === "warmup" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Flame className="mr-1 h-3.5 w-3.5" />}
          Warmup {m.warmupEnabled ? "off" : "on"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => patch({ sync: true }, "sync")}>
          {busy === "sync" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Sync inbox
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Cap</span>
          <Input
            type="number"
            min={1}
            max={200}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            onBlur={() => {
              const n = Number.parseInt(cap, 10);
              if (Number.isFinite(n) && n >= 1 && n <= 200 && n !== m.dailyCap) patch({ dailyCap: n }, "cap");
              else setCap(String(m.dailyCap));
            }}
            className="h-8 w-20 font-mono text-xs"
            aria-label="Daily cold-send cap"
          />
          <span>/day</span>
        </div>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={remove} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Delete mailbox">
          {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </motion.div>
  );
}
