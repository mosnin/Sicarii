"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Check, X, Loader2, RefreshCw, Link2, Trash2, ChevronDown, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mailFetch, relTime, type DomainRow, type MailDomainStatus } from "./types";

const STATUS: Record<MailDomainStatus, { label: string; variant: "success" | "warning" | "secondary" | "destructive" }> = {
  PENDING_PURCHASE: { label: "Awaiting purchase", variant: "secondary" },
  PURCHASED: { label: "DNS pending", variant: "warning" },
  VERIFIED: { label: "Verified", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
};

function Check4({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium", ok ? "border-success/30 bg-success/5 text-success" : "border-border text-muted-foreground")}>
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function DomainCard({
  domain: d,
  canAgentMail,
  canRegistrarPush,
  delay = 0,
  onChanged,
}: {
  domain: DomainRow;
  canAgentMail: boolean;
  canRegistrarPush: boolean;
  delay?: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showRecords, setShowRecords] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const st = STATUS[d.status];
  const ownedHere = d.registrar !== "EXTERNAL";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.3 }} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm text-foreground">{d.domain}</p>
            <Badge variant={st.variant}>{st.label}</Badge>
            {d.connectedToAgentMail && <Badge variant="primary">AgentMail</Badge>}
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {ownedHere ? d.registrar : "yours"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.mailboxCount} mailbox{d.mailboxCount === 1 ? "" : "es"} · DNS checked {relTime(d.dnsCheckedAt)}
            {d.expiresAt ? ` · renews ${new Date(d.expiresAt).toLocaleDateString()}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Check4 ok={d.spfOk} label="SPF" />
          <Check4 ok={d.dkimOk} label="DKIM" />
          <Check4 ok={d.dmarcOk} label="DMARC" />
          <Check4 ok={d.mxOk} label="MX" />
        </div>
      </div>

      {d.findings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {d.findings.slice(0, 4).map((f, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-warning">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {err && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{err}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("verify", () => mailFetch(`/api/mail/domains/${d.id}/verify`, { method: "POST" }))}>
          {busy === "verify" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Re-check DNS
        </Button>
        {canAgentMail && !d.connectedToAgentMail && d.status !== "PENDING_PURCHASE" && (
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("connect", () => mailFetch(`/api/mail/domains/${d.id}/connect`, { method: "POST" }))}>
            {busy === "connect" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
            Connect to AgentMail{canRegistrarPush && ownedHere ? " + push DNS" : ""}
          </Button>
        )}
        {d.dnsRecords.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowRecords((v) => !v)}>
            <ChevronDown className={cn("mr-1 h-3.5 w-3.5 transition-transform", showRecords && "rotate-180")} />
            {d.dnsRecords.length} DNS record{d.dnsRecords.length === 1 ? "" : "s"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy !== null || d.mailboxCount > 0}
          title={d.mailboxCount > 0 ? "Delete its mailboxes first" : "Remove domain"}
          onClick={() => {
            if (!confirm(`Remove ${d.domain} from Scalar? ${ownedHere ? "The registration itself is not cancelled." : ""}`)) return;
            run("delete", () => mailFetch(`/api/mail/domains/${d.id}`, { method: "DELETE" }));
          }}
          className="ml-auto text-muted-foreground hover:text-destructive"
          aria-label="Remove domain"
        >
          {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {showRecords && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-background/60">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="font-mono">
              {d.dnsRecords.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="px-3 py-2 text-foreground">{r.type}</td>
                  <td className="px-3 py-2 text-foreground">{r.name}</td>
                  <td className="max-w-[28rem] truncate px-3 py-2 text-muted-foreground" title={r.data}>
                    {r.priority !== undefined ? `${r.priority} ` : ""}
                    {r.data}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Copy value"
                      onClick={() => {
                        navigator.clipboard?.writeText(r.data);
                        setCopied(i);
                        setTimeout(() => setCopied(null), 1200);
                      }}
                    >
                      {copied === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            {ownedHere && canRegistrarPush
              ? "Scalar pushes these to the registrar automatically when you connect. Re-check DNS after a few minutes."
              : "Add these at your DNS host, then re-check. Propagation usually takes minutes, sometimes up to an hour."}
          </p>
        </div>
      )}
    </motion.div>
  );
}
