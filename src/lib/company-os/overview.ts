// Deterministic Company OS overview (opencompany shape): presentation reads
// live CRM aggregates. No LLM. Jev wardens run on write paths, not here.

import { prisma } from "@/lib/prisma";
import {
  countContacts,
  countDueFollowups,
  countEntities,
  listRecentActivities,
} from "@/lib/crm-operations";

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
    countEntities(userId),
    countContacts(userId),
    countDueFollowups(userId),
    prisma.breakupDraft.count({ where: { userId, status: "PENDING" } }),
    prisma.autopilotPlan.count({ where: { userId, status: "active" } }),
    listRecentActivities(userId, 8),
  ]);

  return {
    workspaceId: userId,
    counts: {
      entities,
      contacts,
      followupsDue: followups,
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
