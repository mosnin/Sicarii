import { prisma } from "@/lib/prisma";

// "The Pulse" - what the agent did while you were away. Computed entirely from
// rows that already exist (no new tracking tables): agent-created entities, the
// CreditLedger audit trail, and MonitorRun signal counts, all windowed to the
// time since the user last opened the dashboard.
//
// Hard rule (the falsifier): never show an empty brag. computePulse returns
// null when nothing happened in the window, so the dashboard falls back to the
// normal greeting instead of "added 0 companies".

export type PulseData = {
  companies: number; // agent-added companies in the window
  enriched: number; // distinct records the agent enriched in the window
  inMarket: number; // intent signals surfaced in the window
  best: { name: string; domain: string | null } | null; // the latest find
};

// CreditLedger actions that represent an enrichment/research lookup landing real
// data on a record (kept in lockstep with CREDIT_COSTS in credits.ts). Cheap
// agent turns and plain searches are excluded so "enriched" means enriched.
const ENRICH_ACTIONS = [
  "email",
  "phone",
  "linkedin",
  "contact_extract",
  "company_aspect",
  "deep_report",
  "analyze_site",
  "deep_research",
];

// Entities/contacts the user added by hand are not the agent's doing. Anything
// else (agent:*, discover:*, or an unlabeled automated row) counts as "while
// you were away".
const NOT_MANUAL = {
  OR: [{ source: null }, { source: { notIn: ["manual", "import"] } }],
};

/**
 * Build the pulse for `userId` covering everything since `since` (the user's
 * previous lastSeenAt). Returns null when the window is empty.
 */
export async function computePulse(userId: string, since: Date): Promise<PulseData | null> {
  const [companies, enrichedRefs, signals, best] = await Promise.all([
    prisma.entity.count({
      where: { userId, createdAt: { gt: since }, ...NOT_MANUAL },
    }),
    prisma.creditLedger.findMany({
      where: {
        userId,
        createdAt: { gt: since },
        action: { in: ENRICH_ACTIONS },
        ref: { not: null },
      },
      select: { ref: true },
      distinct: ["ref"],
    }),
    prisma.monitorRun.aggregate({
      _sum: { found: true },
      where: { userId, createdAt: { gt: since } },
    }),
    prisma.entity.findFirst({
      where: { userId, createdAt: { gt: since }, ...NOT_MANUAL },
      orderBy: { createdAt: "desc" },
      select: { name: true, domain: true },
    }),
  ]);

  const enriched = enrichedRefs.length;
  const inMarket = signals._sum.found ?? 0;

  if (companies === 0 && enriched === 0 && inMarket === 0) return null;

  return { companies, enriched, inMarket, best };
}
