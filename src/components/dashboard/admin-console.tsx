"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AdminUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  plan: string;
  creditsRemaining: number;
  stripeCustomerId: string | null;
  createdAt: string | Date;
  _count: { contacts: number; memberships: number };
};

export function AdminUserTable({ initial }: { initial: AdminUserRow[] }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setRows(d.users ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or name"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Person</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Credits</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">CRM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/${u.id}`} className="hover:text-primary">
                    <span className="font-medium">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unnamed"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{u.email}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 capitalize">
                  {u.plan}
                  {u.role === "admin" && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">admin</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{u.creditsRemaining.toLocaleString()}</td>
                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {u._count.contacts} contacts
                  {u._count.memberships ? ` · ${u._count.memberships} ws` : ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No accounts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminUserActions({
  userId,
  plan,
  role,
  hasStripe,
}: {
  userId: string;
  plan: string;
  role: string;
  hasStripe: boolean;
}) {
  const router = useRouter();
  const [credits, setCredits] = useState("1000");
  const [note, setNote] = useState("");
  const [nextPlan, setNextPlan] = useState(plan);
  const [nextRole, setNextRole] = useState(role);
  const [chargeId, setChargeId] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: string, body: Record<string, unknown>) {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error ?? "Action failed.");
        return;
      }
      if (d.url) {
        window.open(d.url, "_blank");
        setMsg("Opened Stripe billing portal.");
        return;
      }
      setMsg("Done.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Credits</p>
        <p className="mt-1 text-sm text-muted-foreground">Grant more credits. Does not charge the card.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input value={credits} onChange={(e) => setCredits(e.target.value)} className="sm:w-32" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <Button
            size="sm"
            onClick={() => run("credits", { credits: Number(credits), note })}
            disabled={busy !== null || !Number(credits)}
          >
            {busy === "credits" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Grant
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Plan</p>
        <p className="mt-1 text-sm text-muted-foreground">Comp or correct a plan without a checkout.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={nextPlan}
            onChange={(e) => setNextPlan(e.target.value)}
            className="h-10 rounded-full border border-border bg-background px-3 text-sm"
          >
            {["free", "starter", "pro", "business", "beta", "team"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => run("plan", { plan: nextPlan })} disabled={busy !== null}>
            {busy === "plan" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Set plan
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Refund</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Refund a Stripe charge. Leave amount blank for the full charge. Credits stay unless you adjust them above.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input value={chargeId} onChange={(e) => setChargeId(e.target.value)} placeholder="ch_… or pi_…" />
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="USD (optional)" className="sm:w-32" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const id = chargeId.trim();
              const cents = amount ? Math.round(Number(amount) * 100) : undefined;
              const payload = id.startsWith("pi_")
                ? { paymentIntentId: id, amountCents: cents }
                : { chargeId: id, amountCents: cents };
              run("refund", payload);
            }}
            disabled={busy !== null || !chargeId.trim()}
          >
            {busy === "refund" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Refund
          </Button>
        </div>
        {hasStripe && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => run("portal", {})}
            disabled={busy !== null}
          >
            Open Stripe portal
          </Button>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Role</p>
        <p className="mt-1 text-sm text-muted-foreground">Platform admin = unlimited usage and this console.</p>
        <div className="mt-3 flex gap-2">
          <select
            value={nextRole}
            onChange={(e) => setNextRole(e.target.value)}
            className="h-10 rounded-full border border-border bg-background px-3 text-sm"
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => run("role", { role: nextRole })} disabled={busy !== null}>
            {busy === "role" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Set role
          </Button>
        </div>
      </section>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
