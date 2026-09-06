import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AgentIsland } from "@/components/dashboard/agent-island";
import { getOptionalAuthContext } from "@/lib/auth-utils";
import { listUserWorkspaces } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getOptionalAuthContext();
  const user = auth?.account ?? null;
  const isStaff = user?.role === "admin" || user?.role === "team";

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

  const workspaces = auth ? await listUserWorkspaces(auth.actor.id) : [];
  const label = auth
    ? [auth.actor.firstName, auth.actor.lastName].filter(Boolean).join(" ") || auth.actor.email || "Scalar user"
    : "Scalar user";

  return (
    <DashboardShell
      isStaff={isStaff}
      session={auth ? {
        activeAccountId: auth.account.id,
        personalAccountId: auth.actor.id,
        label,
        workspaces,
      } : null}
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
