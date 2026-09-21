"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Plus, Globe, Inbox, Upload, ShoppingCart, ExternalLink, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FloatIn } from "@/components/ui/float-in";
import { cn } from "@/lib/utils";
import { MailboxCard } from "./mailbox-card";
import { DomainCard } from "./domain-card";
import { InboxView } from "./inbox-view";
import { AddOwnDomainForm, BuyDomainForm, BuyInboxesForm, CreateAgentMailForm, ImportInboxesForm } from "./add-forms";
import { mailFetch, usd, type MailStatus, type OrderRow, type OrderStatus } from "./types";

type Panel = "buy-domain" | "add-domain" | "create-agentmail" | "import" | "buy-inboxes" | null;

const ORDER_STATUS: Record<OrderStatus, { label: string; variant: "success" | "warning" | "secondary" | "destructive" | "primary" }> = {
  PENDING: { label: "Awaiting payment", variant: "secondary" },
  PAID: { label: "Fulfilling", variant: "primary" },
  FULFILLED: { label: "Fulfilled", variant: "success" },
  ACTION_REQUIRED: { label: "Action required", variant: "warning" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELED: { label: "Canceled", variant: "secondary" },
};

function Section({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-brand text-lg text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelShell({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.03] p-4 sm:p-5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OrderRowItem({ o }: { o: OrderRow }) {
  const st = ORDER_STATUS[o.status];
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground">
            {o.kind === "DOMAIN" ? "Domain" : `${o.quantity} inbox${o.quantity === 1 ? "" : "es"}`}
            {o.domain ? <span className="font-mono"> · {o.domain}</span> : null}
          </span>
          <Badge variant={st.variant}>{st.label}</Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {o.vendor}
          </Badge>
        </div>
        {o.note && <p className="mt-0.5 text-xs text-muted-foreground">{o.note}</p>}
      </div>
      <span className="tabular-nums text-muted-foreground">{usd(o.amountUsdCents)}</span>
      <span className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</span>
    </div>
  );
}

export function MailboxesManager({ initialNotice }: { initialNotice?: "success" | "cancelled" | null }) {
  const [data, setData] = useState<MailStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [notice, setNotice] = useState(initialNotice ?? null);

  const load = useCallback(async () => {
    try {
      setData(await mailFetch<MailStatus>("/api/mail/status"));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load mailboxes.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // After a Stripe return, fulfilment runs in the background; poll briefly so
  // the new domain / inboxes appear without a manual refresh.
  useEffect(() => {
    if (initialNotice !== "success") return;
    let n = 0;
    const t = setInterval(() => {
      load();
      if (++n >= 12) clearInterval(t);
    }, 5000);
    return () => clearInterval(t);
  }, [initialNotice, load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const done = () => {
    setPanel(null);
    load();
  };

  if (!data && !err) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading mailboxes
      </div>
    );
  }
  if (!data) {
    return <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{err}</p>;
  }

  const { capabilities: caps, mailboxes, domains, orders } = data;
  const attention = orders.filter((o) => o.status === "ACTION_REQUIRED");
  const nothingConfigured = !caps.agentmail && !caps.smtp && !caps.registrar;

  return (
    <div className="space-y-10">
      <AnimatePresence>
        {notice && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("rounded-xl border px-4 py-3 text-sm", notice === "success" ? "border-success/30 bg-success/5 text-foreground" : "border-border bg-muted/40 text-muted-foreground")}>
            {notice === "success" ? "Payment received. Fulfilment is running; this page refreshes itself for the next minute." : "Checkout cancelled. Nothing was charged."}
          </motion.div>
        )}
      </AnimatePresence>

      {nothingConfigured && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm text-muted-foreground">
          This deployment has no mail providers configured yet. Set <code className="text-foreground">AGENTMAIL_API_KEY</code> for API inboxes, <code className="text-foreground">MAILBOX_SECRET_KEY</code> to import Google / Microsoft inboxes, and <code className="text-foreground">PORKBUN_API_KEY</code> or <code className="text-foreground">GODADDY_PAT</code> to buy domains. See <code className="text-foreground">.env.example</code>.
        </div>
      )}

      {attention.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-medium text-foreground">
            {attention.length} order{attention.length === 1 ? "" : "s"} need{attention.length === 1 ? "s" : ""} you
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {attention.map((o) => (
              <li key={o.id}>{o.note ?? "Import the inbox credentials the vendor sent you."}</li>
            ))}
          </ul>
          <Button size="sm" className="mt-3" onClick={() => setPanel("import")}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Import credentials
          </Button>
        </div>
      )}

      {/* Domains */}
      <FloatIn delay={0.05}>
        <Section
          title="Sending domains"
          description="Lookalike domains your agents send from. Each carries SPF, DKIM and DMARC; Scalar audits them and holds sends when they break."
          action={
            <div className="flex flex-wrap gap-2">
              {caps.registrar && (
                <Button size="sm" variant={panel === "buy-domain" ? "default" : "outline"} onClick={() => toggle("buy-domain")}>
                  <ShoppingCart className="mr-1 h-3.5 w-3.5" /> Buy a domain
                </Button>
              )}
              <Button size="sm" variant={panel === "add-domain" ? "default" : "outline"} onClick={() => toggle("add-domain")}>
                <Globe className="mr-1 h-3.5 w-3.5" /> Add one I own
              </Button>
            </div>
          }
        >
          <PanelShell open={panel === "buy-domain"}>
            <BuyDomainForm caps={caps} onDone={done} />
          </PanelShell>
          <PanelShell open={panel === "add-domain"}>
            <AddOwnDomainForm onDone={done} />
          </PanelShell>
          {domains.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              No sending domains yet. Never send cold mail from your main domain; buy or add a lookalike first.
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map((d, i) => (
                <DomainCard key={d.id} domain={d} canAgentMail={caps.agentmail} canRegistrarPush={Boolean(caps.registrar)} delay={i * 0.04} onChanged={load} />
              ))}
            </div>
          )}
        </Section>
      </FloatIn>

      {/* Mailboxes */}
      <FloatIn delay={0.1}>
        <Section
          title="Mailboxes"
          description={`${mailboxes.length} mailbox${mailboxes.length === 1 ? "" : "es"} · ${mailboxes.filter((m) => m.status === "ACTIVE").length} ready for cold mail · ${mailboxes.filter((m) => m.status === "WARMING").length} warming`}
          action={
            <div className="flex flex-wrap gap-2">
              {caps.billing && (caps.agentmail || caps.smtp) && (
                <Button size="sm" variant={panel === "buy-inboxes" ? "default" : "outline"} onClick={() => toggle("buy-inboxes")}>
                  <ShoppingCart className="mr-1 h-3.5 w-3.5" /> Buy inboxes
                </Button>
              )}
              {caps.agentmail && (
                <Button size="sm" variant={panel === "create-agentmail" ? "default" : "outline"} onClick={() => toggle("create-agentmail")}>
                  <Inbox className="mr-1 h-3.5 w-3.5" /> AgentMail inbox
                </Button>
              )}
              {caps.smtp && (
                <Button size="sm" variant={panel === "import" ? "default" : "outline"} onClick={() => toggle("import")}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Import
                </Button>
              )}
            </div>
          }
        >
          <PanelShell open={panel === "buy-inboxes"}>
            <BuyInboxesForm caps={caps} domains={domains} onDone={done} />
          </PanelShell>
          <PanelShell open={panel === "create-agentmail"}>
            <CreateAgentMailForm domains={domains} onDone={done} />
          </PanelShell>
          <PanelShell open={panel === "import"}>
            <ImportInboxesForm orders={orders} onDone={done} />
          </PanelShell>
          {mailboxes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <p className="font-brand text-base">No mailboxes yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your agent needs at least one. Buy a few, create an AgentMail inbox, or import the ones you already have. Every new mailbox warms up for two weeks before it sends its first cold email.
              </p>
              {(caps.agentmail || caps.smtp) && (
                <Button size="sm" className="mt-4" onClick={() => setPanel(caps.agentmail ? "create-agentmail" : "import")}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add a mailbox
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {mailboxes.map((m, i) => (
                <MailboxCard key={m.id} mailbox={m} delay={i * 0.04} onChanged={load} />
              ))}
            </div>
          )}
        </Section>
      </FloatIn>

      {/* Inbox */}
      <FloatIn delay={0.15}>
        <Section title="Conversations" description="Everything your agent mailboxes send and receive, minus warmup chatter. Replies are already classified and attached to the contact.">
          <InboxView mailboxes={mailboxes} />
        </Section>
      </FloatIn>

      {/* Orders */}
      {orders.length > 0 && (
        <FloatIn delay={0.2}>
          <section className="space-y-3">
            <button type="button" onClick={() => setShowOrders((v) => !v)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn("h-4 w-4 transition-transform", showOrders && "rotate-180")} />
              {orders.length} order{orders.length === 1 ? "" : "s"}
            </button>
            {showOrders && (
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {orders.map((o) => (
                  <OrderRowItem key={o.id} o={o} />
                ))}
              </div>
            )}
          </section>
        </FloatIn>
      )}

      <p className="text-xs text-muted-foreground">
        Agents use these mailboxes through MCP: <code className="text-foreground">send_email</code>, <code className="text-foreground">reply_email</code>, <code className="text-foreground">read_inbox</code>, <code className="text-foreground">list_mailboxes</code>.{" "}
        <a href="/skills" className="inline-flex items-center gap-0.5 text-primary hover:underline">
          Cold outreach skill <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}
