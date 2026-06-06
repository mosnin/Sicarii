import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { DashboardPreloader } from "@/components/dashboard/dashboard-preloader";

// New radar signals over the last 7 days. Kept out of the component body so the
// time window (Date.now) isn't an impure call during render.
async function recentRadarSignals(userId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const agg = await prisma.monitorRun.aggregate({
    _sum: { found: true },
    where: { userId, createdAt: { gte: since } },
  });
  return agg._sum.found ?? 0;
}

export default async function DashboardPage() {
  const user = await getDbUser();

  const [totalContacts, totalCompanies, enriched, inConversation, radarActive] = user
    ? await Promise.all([
        prisma.contact.count({ where: { userId: user.id } }),
        prisma.entity.count({ where: { userId: user.id } }),
        prisma.contact.count({
          where: {
            userId: user.id,
            enrichment: { not: Prisma.AnyNull },
          },
        }),
        prisma.contact.count({
          where: {
            userId: user.id,
            status: { in: ["CONTACTED", "REPLIED", "QUALIFIED"] },
          },
        }),
        prisma.intentMonitor.count({ where: { userId: user.id, active: true } }),
      ])
    : [0, 0, 0, 0, 0];

  // The living-state number on the dashboard's Radar line.
  const radarSignals = user ? await recentRadarSignals(user.id) : 0;

  return (
    <>
      <DashboardPreloader name={user?.firstName ?? ""} />
      <DashboardOverview
        firstName={user?.firstName}
        totalContacts={totalContacts}
        totalCompanies={totalCompanies}
        enriched={enriched}
        inConversation={inConversation}
        radarActive={radarActive}
        radarSignals={radarSignals}
      />
    </>
  );
}
