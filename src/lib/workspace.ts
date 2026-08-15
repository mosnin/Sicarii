// Teams: resolve and provision workspace account rows.
//
// A team workspace IS a users row (accountType "workspace"). Every existing
// userId-scoped query, the credit meter, API keys, and OAuth then work for
// teams with no changes - see docs/engineering/teams-plan-2026-07-11.md.
//
// Two ways a workspace comes into being:
//   1. Clerk Organization (clerkId = org_...) - mirrored by webhook / first sight
//   2. Scalar-native (clerkId = ws_<uuid>) - created in-app for a second business
//
// Active context: Clerk orgId wins when set; otherwise the scalar_workspace
// cookie (a users.id the human belongs to). Personal context is the default.

import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/admin";
import { planFor } from "@/lib/credits";
import { OpError } from "@/lib/crm-operations";

export const WORKSPACE_COOKIE = "scalar_workspace";

/** Map a Clerk org role ("org:admin" / "org:member") to our role string. */
export function roleFromClerk(orgRole?: string | null): string {
  return orgRole === "org:admin" || orgRole === "admin" ? "admin" : "member";
}

export function isNativeWorkspace(clerkId: string): boolean {
  return clerkId.startsWith("ws_");
}

export async function readWorkspaceCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const value = jar.get(WORKSPACE_COOKIE)?.value?.trim();
    return value || null;
  } catch {
    return null;
  }
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
  actor: User; // the personal account row of the signed-in human
  orgRole?: string | null;
}): Promise<User> {
  const { orgId, orgName, actor, orgRole } = opts;
  const workspace = await prisma.user.upsert({
    where: { clerkId: orgId },
    // Keep the display name fresh; never touch plan or meter on update.
    update: { ...(orgName ? { firstName: orgName } : {}) },
    create: {
      clerkId: orgId,
      accountType: "workspace",
      email: "",
      firstName: orgName ?? "Team workspace",
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

/** Resolve a cookie-selected workspace the actor actually belongs to. */
export async function resolveCookieWorkspace(
  actor: User,
  workspaceId: string,
): Promise<{ account: User; workspaceRole: string } | null> {
  const membership = await prisma.teamMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
    include: { workspace: true },
  });
  if (!membership || membership.workspace.accountType !== "workspace") return null;
  return { account: membership.workspace, workspaceRole: membership.role };
}

export type WorkspaceSummary = {
  workspaceId: string;
  name: string;
  role: string;
  clerkId: string;
  native: boolean;
  plan: string;
  creditsRemaining: number;
};

/** The workspaces a human belongs to (id + display name + role), for pickers. */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: {
          id: true,
          firstName: true,
          clerkId: true,
          plan: true,
          creditsRemaining: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    workspaceId: m.workspace.id,
    name: m.workspace.firstName ?? "Workspace",
    role: m.role,
    clerkId: m.workspace.clerkId,
    native: isNativeWorkspace(m.workspace.clerkId),
    plan: m.workspace.plan,
    creditsRemaining: m.workspace.creditsRemaining,
  }));
}

export async function workspaceQuota(actor: User): Promise<{
  used: number;
  allowed: number;
  unlimited: boolean;
}> {
  const used = await prisma.teamMember.count({ where: { userId: actor.id } });
  if (isPlatformAdmin(actor)) {
    return { used, allowed: Number.POSITIVE_INFINITY, unlimited: true };
  }
  return { used, allowed: planFor(actor.plan).workspaces, unlimited: false };
}

/**
 * Create a Scalar-native workspace for another business. Isolated CRM,
 * segments, pipelines, and its own credit meter. Free plans cannot create
 * one (users pay); platform admins have no cap.
 */
export async function createNativeWorkspace(actor: User, name: string): Promise<User> {
  const trimmed = name.trim();
  if (!trimmed) throw new OpError("Workspace name is required", 400);
  if (trimmed.length > 80) throw new OpError("Workspace name is too long", 400);
  if (actor.accountType !== "user") {
    throw new OpError("Switch to your personal account to create a workspace", 400);
  }

  const quota = await workspaceQuota(actor);
  if (!quota.unlimited && quota.used >= quota.allowed) {
    throw new OpError(
      quota.allowed === 0
        ? "Upgrade your plan to create workspaces for different businesses."
        : `Your ${actor.plan} plan includes ${quota.allowed} workspace${quota.allowed === 1 ? "" : "s"}. Upgrade for more.`,
      402,
    );
  }

  const unlimited = isPlatformAdmin(actor);
  const workspace = await prisma.user.create({
    data: {
      clerkId: `ws_${randomUUID()}`,
      accountType: "workspace",
      email: "",
      firstName: trimmed,
      plan: unlimited ? "beta" : "free",
      creditsRemaining: unlimited ? 100_000 : 200,
      role: unlimited ? "admin" : "member",
    },
  });
  await prisma.teamMember.create({
    data: { workspaceId: workspace.id, userId: actor.id, role: "admin" },
  });
  return workspace;
}

export async function renameWorkspace(
  actor: User,
  workspaceId: string,
  name: string,
): Promise<User> {
  const trimmed = name.trim();
  if (!trimmed) throw new OpError("Workspace name is required", 400);
  const membership = await prisma.teamMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
    include: { workspace: true },
  });
  if (!membership || membership.workspace.accountType !== "workspace") {
    throw new OpError("Workspace not found", 404);
  }
  if (membership.role !== "admin" && !isPlatformAdmin(actor)) {
    throw new OpError("Only a workspace admin can rename it", 403);
  }
  return prisma.user.update({
    where: { id: workspaceId },
    data: { firstName: trimmed },
  });
}

export async function deleteNativeWorkspace(actor: User, workspaceId: string): Promise<void> {
  const membership = await prisma.teamMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
    include: { workspace: true },
  });
  if (!membership || membership.workspace.accountType !== "workspace") {
    throw new OpError("Workspace not found", 404);
  }
  if (!isNativeWorkspace(membership.workspace.clerkId)) {
    throw new OpError("Delete this team from Clerk Organizations instead", 400);
  }
  if (membership.role !== "admin" && !isPlatformAdmin(actor)) {
    throw new OpError("Only a workspace admin can delete it", 403);
  }
  await prisma.user.delete({ where: { id: workspaceId } });
}
