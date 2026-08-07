import { NextRequest, NextResponse } from "next/server";
import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import { baseCurrencyOf } from "@/lib/currency";
import { andWhere, CLOSED_STAGES, moneyTotals } from "@/lib/conversion";

const STAGES = ["NEW", "ENRICHED", "PROSPECTING", "ENGAGING", "REPLYING", "WON", "LOST"] as const;
const CONVO = ["OPEN", "AWAITING_REPLY", "STALLED", "CLOSED"] as const;
type Stage = (typeof STAGES)[number];
type Convo = (typeof CONVO)[number];

// GET /api/pipelines/[id]/metrics - progress AND money for one pipeline.
//
// Every figure is summed from baseAmount only, in the signed-in user's
// reporting currency, and every total ships with the count of deals it could
// NOT include. A total on its own is a confident wrong number.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const pipeline = await prisma.pipeline.findUnique({ where: { id } });
    if (!pipeline || pipeline.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const base = baseCurrencyOf(user);
    const scope = { pipelineId: id };

    const [entries, total, open, won] = await Promise.all([
      prisma.pipelineEntry.findMany({
        where: { userId: user.id, pipelineId: id },
        select: { stage: true, dealScore: true, conversationStatus: true },
      }),
      moneyTotals(user.id, base, scope),
      // The forecast: open deals only, so a closed-out quarter does not inflate
      // what is still to come. Composed with AND, never spread: moneyTotals
      // adds an OR of its own and a second OR key would silently win.
      moneyTotals(user.id, base, andWhere(scope, { stage: { notIn: CLOSED_STAGES } })),
      moneyTotals(user.id, base, andWhere(scope, { stage: PipelineStage.WON })),
    ]);

    const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    const byConversation = Object.fromEntries(CONVO.map((c) => [c, 0])) as Record<Convo, number>;
    let scoreSum = 0;
    let scored = 0;
    for (const e of entries) {
      byStage[e.stage as Stage]++;
      byConversation[e.conversationStatus as Convo]++;
      if (e.dealScore != null) {
        scoreSum += e.dealScore;
        scored++;
      }
    }

    return NextResponse.json({
      name: pipeline.name,
      objective: pipeline.goal,
      total: entries.length,
      byStage,
      byConversation,
      won: byStage.WON,
      lost: byStage.LOST,
      avgDealScore: scored ? Math.round(scoreSum / scored) : null,
      scored,
      openConversations: entries.length - byConversation.CLOSED,
      // Money. `unconverted` on each block is the number of deals with a value
      // that no rate could bring into `base`; they are excluded, never zeroed.
      money: {
        reportingCurrency: base,
        all: total,
        openPipeline: open,
        won,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET pipeline metrics", e);
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}
