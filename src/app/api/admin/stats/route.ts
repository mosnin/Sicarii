import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-utils";
import { adminForbidden, ensureAdminRole, isPlatformAdmin } from "@/lib/admin";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    const actor = await ensureAdminRole(ctx.actor);
    if (!isPlatformAdmin(actor)) return adminForbidden();

    const [users, workspaces, byPlan, credits, recentActions] = await Promise.all([
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
      prisma.adminAction.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);

    return NextResponse.json({
      users,
      workspaces,
      creditsOutstanding: credits._sum.creditsRemaining ?? 0,
      plans: Object.fromEntries(byPlan.map((p) => [p.plan, p._count.id])),
      recentActions,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/admin/stats", e);
    return NextResponse.json({ error: "Failed to load admin stats" }, { status: 500 });
  }
}
