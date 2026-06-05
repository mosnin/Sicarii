import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDbUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getDbUser();
  const isStaff = user?.role === "admin" || user?.role === "team";

  return (
    <DashboardShell isStaff={isStaff}>
      {children}
    </DashboardShell>
  );
}
