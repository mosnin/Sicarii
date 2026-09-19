import { auth } from "@clerk/nextjs/server";
import { CrmOrgGuard } from "@/components/dashboard/crm-org-guard";

export const dynamic = "force-dynamic";

/**
 * Every CRM route (list, contact, entity, map) paints tenant contacts.
 * Gate the tree on the active Clerk org so a workspace switch cannot show
 * the previous org's people — including when Next replays a cached RSC.
 */
export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { orgId } = await auth();
  return <CrmOrgGuard renderedOrgId={orgId}>{children}</CrmOrgGuard>;
}
