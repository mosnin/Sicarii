"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { cn } from "@/lib/utils";

type Mailbox = {
  id: string;
  email: string;
  displayName: string | null;
  provider: string;
  status: string;
  domainName: string | null;
  warmupDay: number;
  dailySendLimit: number;
  sentToday: number;
  remainingToday: number;
  remainingWarmupToday?: number;
  remainingHourly?: number;
  healthScore?: number;
  pausedReasonLabel?: string | null;
  inboundStatus?: "receiving" | "none";
  lastInboundAt?: string | null;
  lastError: string | null;
};

type Domain = {
  id: string;
  name: string;
  registrar: string;
  status: string;
  spfOk?: boolean | null;
  dkimOk?: boolean | null;
  dmarcOk?: boolean | null;
  mxOk?: boolean | null;
  dnsCheckedAt?: string | null;
  _count?: { mailboxes: number };
};

type SearchResult = {
  availability?: { domain: string; available: boolean; priceCents?: number; currency?: string } | null;
  suggestions?: { domain: string; available: boolean; priceCents?: number }[];
  error?: string;
};

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"inbox" | "domain" | "smtp" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [m, d] = await Promise.all([
      fetch("/api/mailboxes").then((r) => r.json()).catch(() => ({})),
      fetch("/api/domains").then((r) => r.json()).catch(() => ({})),
    ]);
    setMailboxes(m.mailboxes ?? []);
    setDomains(d.domains ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [m, d] = await Promise.all([
        fetch("/api/mailboxes").then((r) => r.json()).catch(() => ({})),
        fetch("/api/domains").then((r) => r.json()).catch(() => ({})),
      ]);
      if (cancelled) return;
      setMailboxes(m.mailboxes ?? []);
      setDomains(d.domains ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <FloatIn>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-6 py-9 sm:px-10 sm:py-12">
            <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary/80">Scalar // Mailboxes</p>
            <h1 className="font-brand mt-2 text-3xl text-foreground sm:text-4xl">Mailboxes</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Give your agent a sending identity. Buy a domain, provision an inbox
              through Premium Inboxes, or connect SMTP you already have. Warmup
              climbs on its own. Agents send from here, not from a logged note.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" variant={panel === "domain" ? "glow" : "default"} onClick={() => setPanel(panel === "domain" ? null : "domain")}>
                Domain
              </Button>
              <Button size="sm" variant={panel === "inbox" ? "glow" : "outline"} onClick={() => setPanel(panel === "inbox" ? null : "inbox")}>
                Buy inbox
              </Button>
              <Button size="sm" variant={panel === "smtp" ? "glow" : "outline"} onClick={() => setPanel(panel === "smtp" ? null : "smtp")}>
                Connect SMTP
              </Button>
            </div>
          </div>
        </div>
      </FloatIn>

      {panel === "domain" && (
        <DomainPanel
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          err={err}
          onDone={() => {
            setPanel(null);
            load();
          }}
        />
      )}
      {panel === "inbox" && (
        <InboxPanel
          domains={domains}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          err={err}
          onDone={() => {
            setPanel(null);
            load();
          }}
        />
      )}
      {panel === "smtp" && (
        <SmtpPanel
          domains={domains}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          err={err}
          onDone={() => {
            setPanel(null);
            load();
          }}
        />
      )}

      {domains.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Domains</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {domains.map((d) => (
              <div key={d.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                <p className="font-brand text-sm">{d.name}</p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={async () => {
                    await fetch("/api/domains", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "check_dns", domainId: d.id }),
                    });
                    load();
                  }}
                >
                  Check DNS
                </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {d.status} · {d.registrar}
                  {d._count ? ` · ${d._count.mailboxes} inbox${d._count.mailboxes === 1 ? "" : "es"}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dnsLine(d)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? null : mailboxes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-brand text-base">No mailboxes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a domain you own, buy an inbox, or connect SMTP so the agent can send.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mailboxes.map((box, i) => (
            <MailboxCard key={box.id} box={box} delay={i * 0.04} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function dnsFlag(ok: boolean | null | undefined, label: string): string {
  if (ok === true) return `${label} ok`;
  if (ok === false) return `${label} fail`;
  return `${label} unchecked`;
}

function dnsLine(d: Domain): string {
  return [dnsFlag(d.spfOk, "SPF"), dnsFlag(d.dkimOk, "DKIM"), dnsFlag(d.dmarcOk, "DMARC"), dnsFlag(d.mxOk, "MX")].join(
    " · ",
  );
}

function DomainPanel({
  busy,
  setBusy,
  setErr,
  err,
  onDone,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (v: string | null) => void;
  err: string | null;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState<SearchResult | null>(null);

  async function lookup() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    setSearch(null);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: name }),
      });
      const d = (await res.json().catch(() => ({}))) as SearchResult;
      if (!res.ok) setErr(d.error ?? "Could not search.");
      else setSearch(d);
    } finally {
      setBusy(false);
    }
  }

  async function addOwned() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error ?? "Could not add domain.");
      else onDone();
    } finally {
      setBusy(false);
    }
  }

  async function buy(domain: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/domains/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.url) window.location.href = d.url;
      else setErr(d.error ?? "Checkout is not configured yet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        Search GoDaddy for a live name, buy it through Scalar, or add a domain you already own.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="acmeoutbound.com" />
        <Button size="sm" onClick={lookup} disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Search
        </Button>
        <Button size="sm" variant="outline" onClick={addOwned} disabled={busy || !name.trim()}>
          I already own this
        </Button>
      </div>
      {search?.availability && (
        <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="font-brand">{search.availability.domain}</span>
          {" · "}
          {search.availability.available ? "available" : "taken"}
          {search.availability.available && (
            <Button size="sm" className="ml-3" onClick={() => buy(search.availability!.domain)} disabled={busy}>
              Buy
            </Button>
          )}
        </div>
      )}
      {search?.suggestions && search.suggestions.length > 0 && (
        <ul className="space-y-1 text-sm">
          {search.suggestions.map((s) => (
            <li key={s.domain} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <span>
                {s.domain}
                <span className="ml-2 text-xs text-muted-foreground">{s.available ? "available" : "taken"}</span>
              </span>
              {s.available && (
                <Button size="sm" variant="outline" onClick={() => buy(s.domain)} disabled={busy}>
                  Buy
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function InboxPanel({
  domains,
  busy,
  setBusy,
  setErr,
  err,
  onDone,
}: {
  domains: Domain[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (v: string | null) => void;
  err: string | null;
  onDone: () => void;
}) {
  const [localPart, setLocalPart] = useState("hello");
  const [displayName, setDisplayName] = useState("");
  const [domainId, setDomainId] = useState("");
  const selectedDomain = domainId || domains[0]?.id || "";

  async function checkout() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/mailboxes/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPart, domainId: selectedDomain, displayName }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.url) {
        window.location.href = d.url;
        return;
      }
      if (res.status === 501) {
        const fallback = await fetch("/api/mailboxes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request", localPart, domainId, displayName }),
        });
        const f = await fallback.json().catch(() => ({}));
        if (!fallback.ok) setErr(f.error ?? d.error ?? "Could not request inbox.");
        else onDone();
        return;
      }
      setErr(d.error ?? "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        Provisions a Google Workspace or Microsoft 365 inbox through Premium Inboxes
        on a domain you already added. Stripe checkout when a mailbox price is configured;
        otherwise we record the order for fulfillment.
      </p>
      {domains.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a domain first.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Local part</label>
              <Input value={localPart} onChange={(e) => setLocalPart(e.target.value)} placeholder="alex" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Domain</label>
              <select
                value={selectedDomain}
                onChange={(e) => setDomainId(e.target.value)}
                className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">From name</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex Chen" />
            </div>
          </div>
          <Button size="sm" onClick={checkout} disabled={busy || !localPart.trim() || !selectedDomain}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Request inbox
          </Button>
        </>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function SmtpPanel({
  domains,
  busy,
  setBusy,
  setErr,
  err,
  onDone,
}: {
  domains: Domain[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (v: string | null) => void;
  err: string | null;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState("587");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [alreadyWarm, setAlreadyWarm] = useState(false);
  const [domainId, setDomainId] = useState("");

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          email,
          displayName,
          alreadyWarm,
          domainId: domainId || undefined,
          smtp: { host, port: Number(port) || 587, secure: port === "465", username, password },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error ?? "Could not connect.");
      else onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        Paste SMTP from Premium Inboxes, Google Workspace, or any provider. Passwords are encrypted at rest.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@acmeoutbound.com" />
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="From name" />
        <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
        <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="SMTP username" />
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="SMTP password" />
      </div>
      {domains.length > 0 && (
        <select
          value={domainId}
          onChange={(e) => setDomainId(e.target.value)}
          className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">No domain link</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={() => setAlreadyWarm((a) => !a)} className="flex items-center gap-2 text-sm">
        <span className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", alreadyWarm ? "bg-primary" : "bg-muted")}>
          <span className={cn("h-4 w-4 rounded-full bg-background transition-transform", alreadyWarm && "translate-x-4")} />
        </span>
        <span className="text-muted-foreground">This inbox is already warm (skip the 21-day ramp)</span>
      </button>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={connect} disabled={busy || !email.trim() || !host.trim() || !username.trim() || !password}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Connect mailbox
      </Button>
    </div>
  );
}

function MailboxCard({ box, delay, onChanged }: { box: Mailbox; delay: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function act(action: "pause" | "resume" | "mark_ready") {
    setBusy(true);
    try {
      await fetch(`/api/mailboxes/${box.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <FloatIn delay={delay}>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-brand truncate text-base">{box.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {box.status}
              {box.domainName ? ` · ${box.domainName}` : ""}
              {` · ${box.provider}`}
              {box.status === "warming" ? ` · day ${box.warmupDay} of 21` : ""}
              {` · ${box.remainingToday} cold left`}
              {box.remainingWarmupToday != null ? ` · ${box.remainingWarmupToday} warmup left` : ""}
              {box.remainingHourly != null ? ` · ${box.remainingHourly}/hr` : ""}
              {box.healthScore != null ? ` · health ${box.healthScore}` : ""}
              {` · inbound ${box.inboundStatus === "receiving" ? "receiving" : "none yet"}`}
            </p>
            {box.pausedReasonLabel && <p className="mt-1 text-xs text-muted-foreground">{box.pausedReasonLabel}</p>}
            {box.lastError && <p className="mt-1 text-xs text-destructive">{box.lastError}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {box.status === "paused" ? (
              <Button size="sm" variant="outline" onClick={() => act("resume")} disabled={busy}>
                Resume
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => act("pause")} disabled={busy}>
                Pause
              </Button>
            )}
            {box.status === "warming" && (
              <Button size="sm" variant="ghost" onClick={() => act("mark_ready")} disabled={busy}>
                Mark ready
              </Button>
            )}
          </div>
        </div>
        {box.status === "warming" && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (box.warmupDay / 21) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </FloatIn>
  );
}
