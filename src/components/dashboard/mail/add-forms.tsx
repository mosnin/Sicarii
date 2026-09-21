"use client";

import { useState } from "react";
import { Loader2, Search, ShoppingCart, Globe, Inbox, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { mailFetch, usd, type Capabilities, type DomainRow, type OrderRow } from "./types";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{msg}</p>;
}

/* ------------------------------ Buy a domain ------------------------------ */

interface Quote {
  domain: string;
  available: boolean;
  premium: boolean;
  registrar: string | null;
  priceUsdCents: number | null;
}

const EMPTY_CONTACT = { firstName: "", lastName: "", email: "", phone: "", organization: "", address1: "", city: "", state: "", postalCode: "", country: "US" };

export function BuyDomainForm({ caps, onDone }: { caps: Capabilities; onDone: () => void }) {
  const [domain, setDomain] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [busy, setBusy] = useState<"quote" | "order" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function getQuote() {
    setBusy("quote");
    setErr(null);
    setQuote(null);
    try {
      const q = await mailFetch<{ quote: Quote }>(`/api/mail/domains/quote?domain=${encodeURIComponent(domain.trim())}`);
      setQuote(q.quote);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't quote that domain.");
    } finally {
      setBusy(null);
    }
  }

  async function order() {
    if (!quote) return;
    setBusy("order");
    setErr(null);
    try {
      const { order } = await mailFetch<{ order: OrderRow }>("/api/mail/orders", {
        method: "POST",
        body: JSON.stringify({ kind: "domain", domain: quote.domain, contact: { ...contact, organization: contact.organization || undefined } }),
      });
      if (order.checkoutUrl) window.location.href = order.checkoutUrl;
      else onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start checkout.");
    } finally {
      setBusy(null);
    }
  }

  const set = (k: keyof typeof EMPTY_CONTACT) => (e: React.ChangeEvent<HTMLInputElement>) => setContact((c) => ({ ...c, [k]: e.target.value }));
  const contactOk = (["firstName", "lastName", "email", "phone", "address1", "city", "state", "postalCode", "country"] as const).every((k) => contact[k].trim());

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Buy a lookalike sending domain (never your main one). Scalar registers it through {caps.registrar === "PORKBUN" ? "Porkbun" : "GoDaddy"}, sets DMARC, and can wire it to AgentMail for you. Price includes a {usd(caps.domainMarkupUsdCents)} setup fee; renewals are billed yearly.
      </p>
      <div className="flex gap-2">
        <Input value={domain} placeholder="try-yourbrand.com" onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && domain.trim() && getQuote()} className="font-mono" />
        <Button onClick={getQuote} disabled={!domain.trim() || busy !== null}>
          {busy === "quote" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
          Check
        </Button>
      </div>
      <ErrorLine msg={err} />
      {quote && (
        <div className={cn("rounded-xl border p-3 text-sm", quote.available ? "border-success/30 bg-success/5" : "border-border bg-muted/40")}>
          <span className="font-mono">{quote.domain}</span>{" "}
          {quote.available ? (
            <>
              is available · <span className="font-medium text-foreground">{quote.priceUsdCents !== null ? usd(quote.priceUsdCents) : "price on checkout"}</span> first year
            </>
          ) : quote.premium ? (
            "is a premium domain and cannot be bought here."
          ) : (
            "is taken. Try a variation."
          )}
        </div>
      )}
      {quote?.available && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="text-xs font-medium text-foreground">Registrant contact (required by ICANN; WHOIS privacy is on)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="First name"><Input value={contact.firstName} onChange={set("firstName")} /></Field>
            <Field label="Last name"><Input value={contact.lastName} onChange={set("lastName")} /></Field>
            <Field label="Email"><Input type="email" value={contact.email} onChange={set("email")} /></Field>
            <Field label="Phone" hint="E.164, e.g. +1.5555550123"><Input value={contact.phone} onChange={set("phone")} /></Field>
            <Field label="Organization (optional)"><Input value={contact.organization} onChange={set("organization")} /></Field>
            <Field label="Address"><Input value={contact.address1} onChange={set("address1")} /></Field>
            <Field label="City"><Input value={contact.city} onChange={set("city")} /></Field>
            <Field label="State / region"><Input value={contact.state} onChange={set("state")} /></Field>
            <Field label="Postal code"><Input value={contact.postalCode} onChange={set("postalCode")} /></Field>
            <Field label="Country (2 letters)"><Input value={contact.country} maxLength={2} onChange={set("country")} className="uppercase" /></Field>
          </div>
          <Button onClick={order} disabled={!contactOk || busy !== null || !caps.billing} className="w-full sm:w-auto">
            {busy === "order" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
            Pay {quote.priceUsdCents !== null ? usd(quote.priceUsdCents) : ""} and register
          </Button>
          {!caps.billing && <p className="text-[11px] text-destructive">Billing is not configured on this deployment.</p>}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Add a domain you own --------------------------- */

export function AddOwnDomainForm({ onDone }: { onDone: () => void }) {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      await mailFetch("/api/mail/domains", { method: "POST", body: JSON.stringify({ domain: domain.trim() }) });
      setDomain("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add domain.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Already own a secondary domain? Add it and Scalar will audit SPF, DKIM, DMARC and MX, and give you the records to publish.</p>
      <div className="flex gap-2">
        <Input value={domain} placeholder="outreach.yourbrand.com" onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && domain.trim() && add()} className="font-mono" />
        <Button onClick={add} disabled={!domain.trim() || busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Globe className="mr-1 h-4 w-4" />}
          Add
        </Button>
      </div>
      <ErrorLine msg={err} />
    </div>
  );
}

/* --------------------------- Create AgentMail inbox --------------------------- */

export function CreateAgentMailForm({ domains, onDone }: { domains: DomainRow[]; onDone: () => void }) {
  const eligible = domains.filter((d) => d.connectedToAgentMail && d.status === "VERIFIED");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [domainId, setDomainId] = useState<string>(eligible[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      await mailFetch("/api/mail/mailboxes", {
        method: "POST",
        body: JSON.stringify({ provider: "agentmail", username: username.trim(), domainId: domainId || null, displayName: displayName.trim() || null }),
      });
      setUsername("");
      setDisplayName("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create inbox.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        An agent-native inbox on AgentMail. Replies arrive by webhook within seconds. Pick one of your verified, connected domains, or leave it on the shared agentmail.to domain for testing.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Username">
          <Input value={username} placeholder="sarah" onChange={(e) => setUsername(e.target.value.toLowerCase())} className="font-mono" />
        </Field>
        <Field label="Domain">
          <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">agentmail.to (shared)</option>
            {eligible.map((d) => (
              <option key={d.id} value={d.id}>
                {d.domain}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Display name (optional)">
          <Input value={displayName} placeholder="Sarah from Acme" onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
      </div>
      <ErrorLine msg={err} />
      <Button onClick={create} disabled={!username.trim() || busy}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Inbox className="mr-1 h-4 w-4" />}
        Create inbox
      </Button>
    </div>
  );
}

/* ----------------------- Import SMTP / PremiumInboxes CSV ----------------------- */

interface ImportResult {
  imported: { address: string }[];
  failed: { address: string; error: string }[];
}

export function ImportInboxesForm({ orders, onDone }: { orders: OrderRow[]; onDone: () => void }) {
  const awaiting = orders.filter((o) => o.kind === "INBOXES" && o.status === "ACTION_REQUIRED");
  const [mode, setMode] = useState<"single" | "csv">("single");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [hint, setHint] = useState<"google" | "microsoft" | "">("");
  const [csv, setCsv] = useState("");
  const [orderId, setOrderId] = useState(awaiting[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      if (mode === "single") {
        await mailFetch("/api/mail/mailboxes", {
          method: "POST",
          body: JSON.stringify({ provider: "smtp", address: address.trim(), password, displayName: displayName.trim() || null, providerHint: hint || null }),
        });
        setAddress("");
        setPassword("");
        setDisplayName("");
        onDone();
      } else {
        const r = await mailFetch<ImportResult>("/api/mail/mailboxes/import", {
          method: "POST",
          body: JSON.stringify({ csv, providerHint: hint || null, orderId: orderId || null }),
        });
        setResult(r);
        if (r.imported.length) {
          setCsv("");
          onDone();
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Bring Google Workspace or Microsoft 365 inboxes: the ones PremiumInboxes delivers, or your own with an app password. Credentials are verified live, then sealed; they never leave the server.
      </p>
      <div className="flex gap-1 rounded-lg border border-border p-1 text-xs">
        {(["single", "csv"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex-1 rounded-md px-3 py-1.5 transition-colors", mode === m ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {m === "single" ? "One inbox" : "CSV (PremiumInboxes export)"}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Provider">
          <select value={hint} onChange={(e) => setHint(e.target.value as typeof hint)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Detect from address / CSV</option>
            <option value="google">Google Workspace</option>
            <option value="microsoft">Microsoft 365</option>
          </select>
        </Field>
        {mode === "csv" && awaiting.length > 0 && (
          <Field label="Attach to order">
            <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">None</option>
              {awaiting.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.quantity} inboxes · {new Date(o.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {mode === "single" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Address"><Input type="email" value={address} onChange={(e) => setAddress(e.target.value)} className="font-mono" /></Field>
          <Field label="App password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" /></Field>
          <Field label="Display name (optional)"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
        </div>
      ) : (
        <Field label="CSV" hint="Columns: email, password, and optionally first_name/last_name, smtp_host, smtp_port, imap_host, imap_port. Header row required.">
          <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder={"email,password,first_name,last_name\nsarah@try-acme.com,abcd efgh ijkl mnop,Sarah,Lee"} className="font-mono text-xs" />
        </Field>
      )}
      <ErrorLine msg={err} />
      {result && (
        <div className="space-y-1 rounded-xl border border-border p-3 text-xs">
          <p className="text-foreground">
            Imported {result.imported.length}, failed {result.failed.length}.
          </p>
          {result.failed.slice(0, 10).map((f) => (
            <p key={f.address} className="font-mono text-destructive">
              {f.address}: {f.error}
            </p>
          ))}
        </div>
      )}
      <Button onClick={submit} disabled={busy || (mode === "single" ? !address.trim() || !password : !csv.trim())}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
        {mode === "single" ? "Verify and add" : "Import CSV"}
      </Button>
    </div>
  );
}

/* ------------------------------ Buy inboxes ------------------------------ */

export function BuyInboxesForm({ caps, domains, onDone }: { caps: Capabilities; domains: DomainRow[]; onDone: () => void }) {
  const [vendor, setVendor] = useState<"agentmail" | "premiuminboxes">(caps.agentmail ? "agentmail" : "premiuminboxes");
  const [quantity, setQuantity] = useState(3);
  const [domainId, setDomainId] = useState<string>("");
  const [usernames, setUsernames] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const agentmailDomains = domains.filter((d) => d.connectedToAgentMail && d.status === "VERIFIED");
  const total = quantity * caps.inboxPriceUsdCents;

  async function order() {
    setBusy(true);
    setErr(null);
    try {
      const names = usernames
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const { order } = await mailFetch<{ order: OrderRow }>("/api/mail/orders", {
        method: "POST",
        body: JSON.stringify({ kind: "inboxes", vendor, quantity, domainId: domainId || null, usernames: names.length ? names.slice(0, quantity) : undefined }),
      });
      if (order.checkoutUrl) window.location.href = order.checkoutUrl;
      else onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {usd(caps.inboxPriceUsdCents)} per inbox per month. Keep it to {caps.maxInboxesPerDomain} inboxes per domain; every inbox warms for two weeks before its first cold send.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Vendor">
          <select value={vendor} onChange={(e) => setVendor(e.target.value as typeof vendor)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            {caps.agentmail && <option value="agentmail">AgentMail (instant, API inboxes)</option>}
            <option value="premiuminboxes">PremiumInboxes (Google / Microsoft, ~6h)</option>
          </select>
        </Field>
        <Field label="Quantity">
          <Input type="number" min={1} max={10} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(10, Number.parseInt(e.target.value, 10) || 1)))} />
        </Field>
        {vendor === "agentmail" ? (
          <Field label="Domain">
            <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">agentmail.to (shared)</option>
              {agentmailDomains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domain}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Domain (optional)">
            <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Vendor picks / provides</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domain}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {vendor === "agentmail" && (
        <Field label="Usernames (optional, comma or space separated)">
          <Input value={usernames} placeholder="sarah, mike, jordan" onChange={(e) => setUsernames(e.target.value)} className="font-mono" />
        </Field>
      )}
      {vendor === "premiuminboxes" && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-muted-foreground">
          PremiumInboxes has no API. After payment Scalar places the order for you; when their CSV of credentials arrives (usually under 6 hours) the order shows &ldquo;Action required&rdquo; and you paste the CSV into Import above. Warmup starts the moment they land.
        </p>
      )}
      <ErrorLine msg={err} />
      <Button onClick={order} disabled={busy || !caps.billing}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
        Pay {usd(total)} and order {quantity} inbox{quantity === 1 ? "" : "es"}
      </Button>
      {!caps.billing && <p className="text-[11px] text-destructive">Billing is not configured on this deployment.</p>}
    </div>
  );
}
