import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AgentIsland } from "@/components/dashboard/agent-island";
import { getDashboardAuth } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getDashboardAuth();
  const user = ctx?.account ?? null;
  const isStaff = ctx?.isStaff ?? false;

  // Live radar count for the AgentIsland HUD; non-critical chrome, never fail
  // the layout over it.
  let radarActive = 0;
  if (user) {
    try {
      radarActive = await prisma.intentMonitor.count({
        where: { userId: user.id, active: true },
      });
    } catch {
      /* island simply shows 0 */
    }
  }

  return (
    <DashboardShell
      isStaff={isStaff}
      workspaceName={user?.accountType === "workspace" ? (user.firstName ?? "Workspace") : "Personal"}
      isWorkspace={user?.accountType === "workspace"}
    >
      {user && (
        <AgentIsland
          credits={user.creditsRemaining}
          plan={user.plan}
          radarActive={radarActive}
        />
      )}
      {children}
    </DashboardShell>
  );
}
