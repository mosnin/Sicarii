import { redirect } from "next/navigation";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { DashboardPreloader } from "@/components/dashboard/dashboard-preloader";
import { hasCompletedFirstRun } from "@/lib/welcome-orchestrator";
import { computePulse } from "@/lib/pulse";

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
  // Behind auth.protect, but be explicit: a null user means no session - send to
  // sign-in rather than rendering a dashboard of zeros.
  if (!user) redirect("/sign-in");

  // New users with no ICP and no data land on /welcome for the first-run
  // performance. Check is fast (two small queries) and skipped if not needed.
  const done = await hasCompletedFirstRun(user.id);
  if (!done) {
    redirect("/welcome");
  }

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

  // The Pulse: what the agent did since the last dashboard visit. Compute the
  // delta from the PREVIOUS lastSeenAt, then stamp it forward. Skipped on the
  // very first visit (lastSeenAt null) so nobody gets their whole history
  // bragged back at them; computePulse returns null when the window is empty.
  let pulse = null;
  try {
    if (user.lastSeenAt) {
      pulse = await computePulse(user.id, user.lastSeenAt);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });
  } catch (e) {
    // The Pulse is non-critical chrome; never let it 500 the dashboard.
    console.warn("[dashboard] pulse/lastSeenAt update failed", e);
  }

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
        pulse={pulse}
        isEmpty={totalContacts === 0 && totalCompanies === 0}
      />
    </>
  );
}
