// Active Clerk org vs personal account. Used to key UI so a workspace switch
// cannot leave the previous tenant's CRM on screen, and so greetings / profile
// never render the synthetic workspace row as the signed-in human.

/** Stable key for the active Clerk organization, or personal context. */
export function orgScopeKey(orgId?: string | null): string {
  const id = orgId?.trim();
  return id ? id : "personal";
}

/**
 * The human's first name for greetings and the Settings profile card.
 * A workspace row's firstName is the team name (or "Team workspace") and must
 * never be shown as the person looking at the page.
 */
export function humanFirstName(
  actor: { accountType?: string | null; firstName?: string | null } | null | undefined,
): string {
  if (!actor || actor.accountType === "workspace") return "";
  return actor.firstName?.trim() ?? "";
}

/**
 * Picker label for a team workspace. Prefer the real org name; fall back to a
 * unique slug so two unnamed teams are not both "Team workspace".
 */
export function workspaceDisplayName(opts: {
  firstName?: string | null;
  fallback?: string | null;
}): string {
  const named = opts.firstName?.trim();
  if (named && named !== "Team workspace") return named;
  const fallback = opts.fallback?.trim();
  if (fallback) return fallback;
  return named || "Team workspace";
}

/** Name to stamp on first-sight workspace provision. Prefer the Clerk org name. */
export function workspaceCreateName(opts: {
  orgName?: string | null;
  orgSlug?: string | null;
}): string {
  return workspaceDisplayName({
    firstName: opts.orgName,
    fallback: opts.orgSlug,
  });
}
