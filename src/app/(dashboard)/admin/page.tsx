import Link from "next/link";
import { redirect } from "next/navigation";
import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { getDashboardAuth } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { AdminUserTable } from "@/components/dashboard/admin-console";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const ctx = await getDashboardAuth();
  if (!ctx?.isStaff) redirect("/dashboard");

  const [users, workspaces, byPlan, credits, recent] = await Promise.all([
    prisma.user.count({ where: { accountType: "user" } }),
    prisma.user.count({ where: { accountType: "workspace" } }),
    prisma.user.groupBy({
      by: ["plan"],
      where: { accountType: "user" },
      _count: { id: true },
    }),
    prisma.user.aggregate({
      where: { accountType: { in: ["user", "workspace"] } },
      _sum: { creditsRemaining: true },
    }),
    prisma.user.findMany({
      where: { accountType: "user" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        plan: true,
        creditsRemaining: true,
        stripeCustomerId: true,
        createdAt: true,
        _count: { select: { contacts: true, memberships: true } },
      },
    }),
  ]);

  const planLine = byPlan
    .map((p) => `${p._count.id} ${p.plan}`)
    .join(" · ");

  return (
    <div className="space-y-8">
      <FloatIn>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-6 py-9 sm:px-10 sm:py-12">
            <p className="font-brand text-xs uppercase tracking-[0.25em] text-primary/80">
              Scalar // Admin
            </p>
            <h1 className="font-brand mt-2 text-3xl text-foreground sm:text-4xl">
              The house
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Users, credits, refunds, billing. Admins are not metered.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="People" value={users} />
              <Stat label="Workspaces" value={workspaces} />
              <Stat label="Credits out" value={credits._sum.creditsRemaining ?? 0} />
            </div>
            {planLine && (
              <p className="mt-4 text-xs text-muted-foreground">{planLine}</p>
            )}
          </div>
        </div>
      </FloatIn>

      <FloatIn delay={0.08}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-primary">Accounts</p>
            <h2 className="font-brand mt-1 text-2xl">Everyone</h2>
          </div>
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
            Your settings
          </Link>
        </div>
        <AdminUserTable initial={recent} />
      </FloatIn>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="font-brand mt-1 text-2xl tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
