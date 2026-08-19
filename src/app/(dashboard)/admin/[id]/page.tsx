import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FloatIn } from "@/components/ui/float-in";
import { AdminUserActions } from "@/components/dashboard/admin-console";
import { getDashboardAuth } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/ids";
import { listCustomerCharges, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getDashboardAuth();
  if (!ctx?.isStaff) redirect("/dashboard");
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      plan: true,
      creditsRemaining: true,
      creditsResetAt: true,
      stripeCustomerId: true,
      accountType: true,
      createdAt: true,
      _count: {
        select: { contacts: true, entities: true, segments: true, pipelines: true, members: true, memberships: true },
      },
    },
  });
  if (!user) notFound();

  const [ledger, memberships] = await Promise.all([
    prisma.creditLedger.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    user.accountType === "user"
      ? prisma.teamMember.findMany({
          where: { userId: id },
          include: { workspace: { select: { id: true, firstName: true, plan: true } } },
        })
      : prisma.teamMember.findMany({
          where: { workspaceId: id },
          include: { user: { select: { id: true, email: true, firstName: true } } },
        }),
  ]);

  let charges: { id: string; amount: number; currency: string; refunded: boolean; created: number; status: string }[] = [];
  if (user.stripeCustomerId && stripeConfigured()) {
    const listed = await listCustomerCharges(user.stripeCustomerId, 12);
    if ("charges" in listed) charges = listed.charges;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Account";

  return (
    <div className="space-y-8">
      <FloatIn>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          All accounts
        </Link>
        <h1 className="font-brand mt-2 text-3xl text-foreground">{name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.email || "workspace"} · {user.accountType} · {user.plan} · {user.creditsRemaining.toLocaleString()} credits
          {user.role === "admin" ? " · platform admin" : ""}
        </p>
      </FloatIn>

      <FloatIn delay={0.06}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Mini label="Contacts" value={user._count.contacts} />
          <Mini label="Companies" value={user._count.entities} />
          <Mini label="Lists" value={user._count.segments} />
          <Mini label="Pipelines" value={user._count.pipelines} />
        </div>
      </FloatIn>

      <FloatIn delay={0.1}>
        <AdminUserActions
          userId={user.id}
          plan={user.plan}
          role={user.role}
          hasStripe={Boolean(user.stripeCustomerId)}
        />
      </FloatIn>

      {charges.length > 0 && (
        <FloatIn delay={0.12}>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Stripe charges</p>
          <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
            {charges.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium tabular-nums">
                    {(c.amount / 100).toFixed(2)} {c.currency.toUpperCase()}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.id}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.refunded ? "refunded" : c.status} · {new Date(c.created * 1000).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </FloatIn>
      )}

      {memberships.length > 0 && (
        <FloatIn delay={0.14}>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {user.accountType === "user" ? "Workspaces" : "Members"}
          </p>
          <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
            {memberships.map((m) => {
              if (user.accountType === "user" && "workspace" in m) {
                return (
                  <Link key={m.id} href={`/admin/${m.workspace.id}`} className="block px-4 py-3 text-sm hover:bg-muted/40">
                    {m.workspace.firstName ?? "Workspace"} · {m.workspace.plan} · {m.role}
                  </Link>
                );
              }
              if ("user" in m) {
                return (
                  <Link key={m.id} href={`/admin/${m.user.id}`} className="block px-4 py-3 text-sm hover:bg-muted/40">
                    {m.user.firstName || m.user.email} · {m.role}
                  </Link>
                );
              }
              return null;
            })}
          </div>
        </FloatIn>
      )}

      <FloatIn delay={0.16}>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Credit ledger</p>
        <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
          {ledger.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No movements yet.</p>
          ) : (
            ledger.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{row.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </p>
                </div>
                <p className={row.delta < 0 ? "tabular-nums text-muted-foreground" : "tabular-nums text-primary"}>
                  {row.delta > 0 ? "+" : ""}
                  {row.delta} → {row.balanceAfter}
                </p>
              </div>
            ))
          )}
        </div>
      </FloatIn>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="font-brand mt-1 text-xl tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
