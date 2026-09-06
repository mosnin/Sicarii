import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function scalarPublicOrigin(req: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
        return url.origin;
      }
    } catch {
      // Fall back to the server-parsed request URL, never forwarded host data.
    }
  }
  return new URL(req.url).origin;
}

export function scalarDeepLink(origin: string, path = "/dashboard") {
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
  return new URL(safePath, origin).toString();
}

export async function buildCompanyOsOverview(accountId: string, origin: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const followupCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const [account, companies, contacts, enriched, inConversation, radarActive, signalCount, replies, dueFollowups, toEnrich, activity] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: accountId }, select: { id: true, firstName: true, email: true, accountType: true } }),
      prisma.entity.count({ where: { userId: accountId } }),
      prisma.contact.count({ where: { userId: accountId } }),
      prisma.contact.count({ where: { userId: accountId, enrichment: { not: Prisma.AnyNull } } }),
      prisma.contact.count({ where: { userId: accountId, status: { in: ["CONTACTED", "REPLIED", "QUALIFIED"] } } }),
      prisma.intentMonitor.count({ where: { userId: accountId, active: true } }),
      prisma.monitorRun.aggregate({ where: { userId: accountId, createdAt: { gte: sevenDaysAgo } }, _sum: { found: true } }),
      prisma.contact.count({ where: { userId: accountId, status: "REPLIED" } }),
      prisma.contact.count({ where: { userId: accountId, status: "CONTACTED", OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: followupCutoff } }] } }),
      prisma.entity.count({ where: { userId: accountId, status: "NEW" } }),
      prisma.activity.findMany({
        where: { userId: accountId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          kind: true,
          body: true,
          channel: true,
          actorLabel: true,
          createdAt: true,
          contact: { select: { id: true, name: true } },
          entity: { select: { id: true, name: true } },
        },
      }),
    ]);

  if (!account) return null;
  const accountName = account.firstName || account.email || "Scalar account";
  return {
    schemaVersion: "2026-09-01",
    app: {
      id: "scalar",
      name: "Scalar",
      description: "Agent-operated company intelligence and CRM",
      homeUrl: scalarDeepLink(origin),
      capabilities: ["discover", "enrich", "intent", "crm", "agent-operations"],
    },
    account: { id: account.id, name: accountName, type: account.accountType },
    overview: {
      metrics: { companies, contacts, enriched, inConversation, radarActive, radarSignalsLast7Days: signalCount._sum.found ?? 0 },
      needsAttention: { replies, dueFollowups, toEnrich },
      recentActivity: activity.map((item) => ({
        id: item.id,
        kind: item.kind,
        summary: item.body,
        channel: item.channel,
        actor: item.actorLabel,
        occurredAt: item.createdAt.toISOString(),
        target: item.contact
          ? { type: "contact", id: item.contact.id, name: item.contact.name, openUrl: scalarDeepLink(origin, `/crm/${item.contact.id}`) }
          : item.entity
            ? { type: "company", id: item.entity.id, name: item.entity.name, openUrl: scalarDeepLink(origin, `/crm/entity/${item.entity.id}`) }
            : null,
      })),
    },
    actions: [
      { id: "open-scalar", label: "Open in Scalar", url: scalarDeepLink(origin) },
      { id: "open-crm", label: "Open CRM in Scalar", url: scalarDeepLink(origin, "/crm") },
      { id: "open-radar", label: "Open Radar in Scalar", url: scalarDeepLink(origin, "/radar") },
    ],
  };
}
