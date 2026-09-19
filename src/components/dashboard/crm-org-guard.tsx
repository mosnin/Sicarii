"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { crmOrgScopeKey, shouldPaintCrmContacts } from "@/lib/crm-org-scope";

const subscribeNoop = () => () => {};
const clientTrue = () => true;
const serverFalse = () => false;

/**
 * Holds back the CRM tree until the Clerk org in the browser matches the org
 * the server rendered. A mismatch (live switch, or a cached /crm payload from
 * the previous workspace) must not paint contact names.
 */
export function CrmOrgGuard({
  renderedOrgId,
  children,
}: {
  renderedOrgId?: string | null;
  children: React.ReactNode;
}) {
  const { orgId, isLoaded } = useAuth();
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeNoop, clientTrue, serverFalse);
  const lastRefresh = useRef("");

  useEffect(() => {
    if (!isLoaded) return;
    const client = crmOrgScopeKey(orgId);
    const server = crmOrgScopeKey(renderedOrgId);
    if (client === server) return;
    const token = `${client}|${server}`;
    if (lastRefresh.current === token) return;
    lastRefresh.current = token;
    router.refresh();
  }, [isLoaded, orgId, renderedOrgId, router]);

  if (
    !shouldPaintCrmContacts({
      hydrated,
      clerkLoaded: isLoaded,
      clientOrgId: orgId,
      renderedOrgId,
    })
  ) {
    return <CrmOrgPending />;
  }

  return <>{children}</>;
}

function CrmOrgPending() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading workspace">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
