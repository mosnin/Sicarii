// Execute one autopilot plan's scheduled tick: a bounded chunk of discovery,
// enrichment, and outreach-surfacing work, each step gated by
// runAutopilotStep so the plan can never spend past its approved ceiling.
// Mirrors the shape of radar-run.ts (runIntentMonitorOnce) - shared by the
// Inngest cron.
//
// v1 scope, named honestly: each tick does a BOUNDED number of steps per
// category (below), not "spend until the whole window's budget is gone in one
// shot." This trades full budget utilization every cycle for a bounded,
// predictable blast radius per invocation - a deliberate, documented
// simplification (see docs/decisions/0010-budgeted-autopilot.md), not an
// oversight. Raising the caps is a one-line change once real usage justifies it.

import type { AutopilotPlan, AutopilotAllocation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findCompanies, enrichEntity, listDueFollowups } from "@/lib/crm-operations";
import { CREDIT_COSTS } from "@/lib/credits";
import { runAutopilotStep, type Category } from "@/lib/autopilot-operations";

const MAX_DISCOVERY_CALLS = 3;
const MAX_ENRICH_CALLS = 5;
const MAX_OUTREACH_FLAGGED = 10;

export interface TouchedItem {
  id: string;
  kind: "entity" | "contact";
  name?: string | null;
  domain?: string | null;
}

export interface AutopilotTickResult {
  ranSteps: string[];
  touched: TouchedItem[];
  status: string;
}

async function currentStatus(planId: string): Promise<string | undefined> {
  const p = await prisma.autopilotPlan.findUnique({ where: { id: planId }, select: { status: true } });
  return p?.status;
}

/** Run one tick for an active plan. Assumes the caller already filtered to
 *  status "active" and nextRunAt <= now; re-checks status between steps since
 *  a step can hard-stop the plan mid-tick (budget exhaustion). */
export async function runAutopilotPlanOnce(
  plan: AutopilotPlan & { allocations: AutopilotAllocation[] },
): Promise<AutopilotTickResult> {
  const ranSteps: string[] = [];
  const touched: TouchedItem[] = [];

  // ── Discovery ────────────────────────────────────────────────────────────
  if (plan.discoveryQuery) {
    for (let i = 0; i < MAX_DISCOVERY_CALLS; i++) {
      if ((await currentStatus(plan.id)) !== "active") break;
      const step = await runAutopilotStep({
        userId: plan.userId,
        planId: plan.id,
        category: "discovery" as Category,
        action: "find_companies",
        cost: CREDIT_COSTS.find_companies,
        run: () => findCompanies(plan.userId, { query: plan.discoveryQuery!, count: 10 }),
        summaryFor: (r) => `Discovery: added ${r.added} compan${r.added === 1 ? "y" : "ies"} for "${plan.discoveryQuery}" (${r.skipped} already known).`,
      });
      if (!step.ran) break;
      ranSteps.push("discovery");
      touched.push(...step.result.created.map((c) => ({ id: c.id, kind: "entity" as const, name: c.name, domain: c.domain })));
      if (step.result.added === 0) break; // no new ground to cover; stop looping
    }
  }

  // ── Enrichment ───────────────────────────────────────────────────────────
  if ((await currentStatus(plan.id)) === "active") {
    const candidates = await prisma.entity.findMany({
      where: { userId: plan.userId, domain: { not: null }, status: { in: ["NEW", "ENRICHED"] } },
      orderBy: { updatedAt: "asc" },
      take: 25,
      select: { id: true, name: true, domain: true, enrichment: true },
    });
    let calls = 0;
    for (const entity of candidates) {
      if (calls >= MAX_ENRICH_CALLS) break;
      const already =
        entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
          ? (entity.enrichment as Record<string, unknown>)
          : {};
      if (already.firmographics) continue; // already enriched, idempotent skip - no point spending a step on it
      if ((await currentStatus(plan.id)) !== "active") break;

      const step = await runAutopilotStep({
        userId: plan.userId,
        planId: plan.id,
        category: "enrichment" as Category,
        action: "company_aspect",
        cost: CREDIT_COSTS.company_aspect,
        ref: entity.id,
        run: () => enrichEntity(plan.userId, entity.id),
        summaryFor: () => `Enrichment: enriched ${entity.name}.`,
      });
      calls++;
      if (!step.ran) break; // exhausted or errored; stop this category for the tick
      ranSteps.push("enrichment");
      touched.push({ id: entity.id, kind: "entity", name: entity.name, domain: entity.domain });
    }
  }

  // ── Outreach (surfacing, not sending - free) ────────────────────────────
  if ((await currentStatus(plan.id)) === "active") {
    const due = await listDueFollowups(plan.userId, { limit: MAX_OUTREACH_FLAGGED });
    if (due.length > 0) {
      await runAutopilotStep({
        userId: plan.userId,
        planId: plan.id,
        category: "outreach" as Category,
        action: "list_due_followups",
        cost: 0, // reading the CRM is free; this step only surfaces what to act on
        run: async () => due,
        summaryFor: (rows) => `Outreach: flagged ${rows.length} contact${rows.length === 1 ? "" : "s"} due for follow-up.`,
      });
      ranSteps.push("outreach");
      touched.push(...due.map((c) => ({ id: c.id, kind: "contact" as const, name: c.name })));
    }
  }

  const status = (await currentStatus(plan.id)) ?? plan.status;
  return { ranSteps, touched, status };
}
