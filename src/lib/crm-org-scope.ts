// Active Clerk org vs personal account, for the CRM tree only.
//
// Switching organization updates Clerk's client session immediately. The App
// Router can still replay a cached /crm (or /crm/[id]) RSC payload from the
// previous tenant — contact names and emails — before the server re-renders.
// CRM UI must not paint those rows unless the payload's org matches the
// org the browser is in right now.

/** Stable key for the active Clerk organization, or personal context. */
export function crmOrgScopeKey(orgId?: string | null): string {
  const id = orgId?.trim();
  return id ? id : "personal";
}

/**
 * Whether it is safe to paint CRM rows from a server payload.
 * Never true before Clerk has loaded or before the client has hydrated —
 * otherwise a stale RSC replay would flash the previous org's contacts.
 */
export function shouldPaintCrmContacts(opts: {
  hydrated: boolean;
  clerkLoaded: boolean;
  clientOrgId?: string | null;
  renderedOrgId?: string | null;
}): boolean {
  if (!opts.hydrated || !opts.clerkLoaded) return false;
  return crmOrgScopeKey(opts.clientOrgId) === crmOrgScopeKey(opts.renderedOrgId);
}
