import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default async function DashboardPage() {
  const user = await getDbUser();

  const [total, active, won] = user
    ? await Promise.all([
        prisma.contact.count({ where: { userId: user.id } }),
        prisma.contact.count({
          where: {
            userId: user.id,
            status: { in: ["CONTACTED", "REPLIED", "QUALIFIED"] },
          },
        }),
        prisma.contact.count({ where: { userId: user.id, status: "WON" } }),
      ])
    : [0, 0, 0];

  return (
    <DashboardOverview
      firstName={user?.firstName}
      total={total}
      active={active}
      won={won}
    />
  );
}
