"use client";

import { useAuth } from "@clerk/nextjs";
import { orgScopeKey } from "@/lib/org-scope";

/** Client-side tenant key. Changes the moment Clerk switches organization. */
export function useOrgScopeKey(): string {
  const { orgId } = useAuth();
  return orgScopeKey(orgId);
}
