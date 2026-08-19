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
  const homeName = ctx
    ? [ctx.actor.firstName, ctx.actor.lastName].filter(Boolean).join(" ") || "Home"
    : "Home";
  const workspaceName =
    user?.accountType === "workspace" ? (user.firstName ?? "Workspace") : homeName;

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
      workspaceName={workspaceName}
      workspaceId={user?.accountType === "workspace" ? user.id : null}
      homeName={homeName}
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
