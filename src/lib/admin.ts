// Application-owner admin: unlimited plan/feature caps for the people who
// run Scalar, without weakening tenant isolation.
//
// Who qualifies:
//   1. User.role === "admin" (stamped on the personal account row)
//   2. email listed in OWNER_EMAILS (comma-separated, case-insensitive)
//
// What this does NOT do:
//   - It does not let an owner read another account's CRM. Every query stays
//     scoped to the caller's userId.
//   - It does not treat a Clerk org "admin" (workspaceRole) as an owner.
//     Team admins of a customer workspace stay on that workspace's plan.
//   - It does not skip abuse guards (rate limits, creation budget).

export type OwnerAdminFields = {
  role?: string | null;
  email?: string | null;
};

export type OwnerEnv = Record<string, string | undefined>;

/** Normalized owner emails from OWNER_EMAILS (or OWNER_EMAIL). */
export function ownerEmails(env: OwnerEnv = process.env): string[] {
  const raw = env.OWNER_EMAILS ?? env.OWNER_EMAIL ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerAdmin(
  user: OwnerAdminFields | null | undefined,
  env: OwnerEnv = process.env,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const email = user.email?.trim().toLowerCase();
  return Boolean(email && ownerEmails(env).includes(email));
}

/** Role to stamp on provision: admin when the email is an owner, else fallback. */
export function roleForEmail(
  email: string | null | undefined,
  fallback = "member",
  env: OwnerEnv = process.env,
): string {
  if (isOwnerAdmin({ email, role: fallback }, env)) return "admin";
  return fallback;
}

/**
 * Monitor allowance for a user. null means unlimited (owner admin).
 * Regular accounts use the plan's numeric cap, including 0 on free.
 */
export function monitorCapFor(
  user: OwnerAdminFields & { plan?: string | null },
  planMonitors: number,
  env: OwnerEnv = process.env,
): number | null {
  if (isOwnerAdmin(user, env)) return null;
  return planMonitors;
}

export function isMonitorCapReached(
  user: OwnerAdminFields & { plan?: string | null },
  existingCount: number,
  planMonitors: number,
  env: OwnerEnv = process.env,
): boolean {
  const cap = monitorCapFor(user, planMonitors, env);
  if (cap === null) return false;
  return existingCount >= cap;
}
