import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AgentIsland } from "@/components/dashboard/agent-island";
import { getOptionalAuthContext } from "@/lib/auth-utils";
import { orgScopeKey } from "@/lib/org-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getOptionalAuthContext();
  const account = ctx?.account ?? null;
  const actor = ctx?.actor ?? null;
  // Staff chrome follows the human, not the synthetic workspace row. Using
  // account.role here hid admin UI in every team context (workspace rows
  // default to "member").
  const isStaff = actor?.role === "admin" || actor?.role === "team";
  const scopeKey = orgScopeKey(ctx?.orgId);

  // Live radar count for the AgentIsland HUD; non-critical chrome, never fail
  // the layout over it. Count is scoped to the ACTIVE account (personal or team).
  let radarActive = 0;
  if (account) {
    try {
      radarActive = await prisma.intentMonitor.count({
        where: { userId: account.id, active: true },
      });
    } catch {
      /* island simply shows 0 */
    }
  }

  return (
    <DashboardShell isStaff={isStaff} orgScopeKey={scopeKey}>
      {account && (
        <AgentIsland
          credits={account.creditsRemaining}
          plan={account.plan}
          radarActive={radarActive}
        />
      )}
      {children}
    </DashboardShell>
  );
}
