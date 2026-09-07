// Team workspaces are account rows. Membership is the only authority used when
// selecting a workspace, so a modified browser cookie cannot cross tenants.

import { prisma } from "@/lib/prisma";

/** The workspaces a human belongs to (id + display name + role), for pickers. */
export async function listUserWorkspaces(userId: string) {
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, firstName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    workspaceId: m.workspace.id,
    name: m.workspace.firstName ?? "Team workspace",
    role: m.role,
  }));
}
