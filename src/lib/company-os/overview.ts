// Deterministic Company OS overview (opencompany shape): presentation reads
// live CRM aggregates. No LLM. Jev wardens run on write paths, not here.

import { prisma } from "@/lib/prisma";
import { listDueFollowups } from "@/lib/crm-operations";

export type CompanyOsOverview = {
  workspaceId: string;
  counts: {
    entities: number;
    contacts: number;
    followupsDue: number;
    pendingDrafts: number;
    autopilotActive: number;
  };
  recent: Array<{
    id: string;
    kind: string;
    body: string;
    createdAt: string;
  }>;
};

export async function loadCompanyOsOverview(userId: string): Promise<CompanyOsOverview> {
  const [entities, contacts, followups, pendingDrafts, autopilotActive, recent] = await Promise.all([
    prisma.entity.count({ where: { userId } }),
    prisma.contact.count({ where: { userId } }),
    listDueFollowups(userId, { limit: 200 }),
    prisma.breakupDraft.count({ where: { userId, status: "PENDING" } }),
    prisma.autopilotPlan.count({ where: { userId, status: "active" } }),
    prisma.activity.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, kind: true, body: true, createdAt: true },
    }),
  ]);

  return {
    workspaceId: userId,
    counts: {
      entities,
      contacts,
      followupsDue: followups.length,
      pendingDrafts,
      autopilotActive,
    },
    recent: recent.map((a) => ({
      id: a.id,
      kind: a.kind,
      body: a.body.slice(0, 240),
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
