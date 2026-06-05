import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { DashboardPreloader } from "@/components/dashboard/dashboard-preloader";

export default async function DashboardPage() {
  const user = await getDbUser();

  const [totalContacts, totalCompanies, enriched, inConversation] = user
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
      ])
    : [0, 0, 0, 0];

  return (
    <>
      <DashboardPreloader name={user?.firstName ?? ""} />
      <DashboardOverview
        firstName={user?.firstName}
        totalContacts={totalContacts}
        totalCompanies={totalCompanies}
        enriched={enriched}
        inConversation={inConversation}
      />
    </>
  );
}
