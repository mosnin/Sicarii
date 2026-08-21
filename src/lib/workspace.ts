// Teams: resolve and provision workspace account rows.
//
// A team workspace IS a users row (accountType "workspace", clerkId = the Clerk
// Organization id). Every existing userId-scoped query, the credit meter, API
// keys, and OAuth then work for teams with no changes - see
// docs/engineering/teams-plan-2026-07-11.md. This module is the one place that
// maps a Clerk org to that row and keeps membership mirrored.

import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { workspaceCreateName, workspaceDisplayName } from "@/lib/org-scope";

/** Map a Clerk org role ("org:admin" / "org:member") to our role string. */
export function roleFromClerk(orgRole?: string | null): string {
  return orgRole === "org:admin" || orgRole === "admin" ? "admin" : "member";
}

/**
 * Get or provision the workspace account row for a Clerk Organization, and
 * make sure the acting human is mirrored as a member. Clerk only puts an orgId
 * in the session when the user belongs to that org, so membership here is a
 * mirror, not an access decision - but keep it fresh for role checks and the
 * share flow. Never depends on the org webhook having fired (same
 * provision-on-first-sight pattern as User).
 */
export async function resolveWorkspace(opts: {
  orgId: string;
  orgName?: string | null;
  orgSlug?: string | null;
  actor: User; // the personal account row of the signed-in human
  orgRole?: string | null;
}): Promise<User> {
  const { orgId, orgName, orgSlug, actor, orgRole } = opts;
  const createName = workspaceCreateName({ orgName, orgSlug });
  const workspace = await prisma.user.upsert({
    where: { clerkId: orgId },
    // Keep the display name fresh when Clerk gave us the real org name.
    // Never overwrite a webhook-set name with a slug, and never touch plan
    // or meter on update.
    update: { ...(orgName?.trim() ? { firstName: orgName.trim() } : {}) },
    create: {
      clerkId: orgId,
      accountType: "workspace",
      email: "",
      firstName: createName,
      plan: "free",
      creditsRemaining: 200,
    },
  });
  await prisma.teamMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: actor.id } },
    update: { role: roleFromClerk(orgRole) },
    create: {
      workspaceId: workspace.id,
      userId: actor.id,
      role: roleFromClerk(orgRole),
    },
  });
  return workspace;
}

/** The workspaces a human belongs to (id + display name + role), for pickers. */
export async function listUserWorkspaces(userId: string) {
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, firstName: true, clerkId: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    workspaceId: m.workspace.id,
    name: workspaceDisplayName({
      firstName: m.workspace.firstName,
      fallback: m.workspace.clerkId,
    }),
    role: m.role,
  }));
}
