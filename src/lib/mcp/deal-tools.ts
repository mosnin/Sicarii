// MCP tools for deal value: what a deal is worth, what the pipeline adds up
// to, and which deals are the big ones.
//
// The coordinator wires this in from the MCP route; nothing here reaches into
// that file. The ctx interface below is the small surface those tools need:
// the same run/gated/userIdFrom helpers every other tool in the route uses, so
// errors, rate limits and tenant scoping behave identically.
//
// Every figure crossing this boundary is a Decimal string, never a float, and
// every total ships with the count of deals it could not include.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Prisma } from "@prisma/client";
import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { normalizeCurrency, reportingCurrencyOf } from "@/lib/currency";
import {
  CLOSED_STAGES,
  andWhere,
  dealsByValue,
  moneyTotals,
  moneyUpdate,
  serializeMoney,
} from "@/lib/conversion";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** The helpers the MCP route already defines. Structurally typed so the route
 *  can pass its own functions unchanged. */
export interface DealToolsContext {
  /** The authenticated user id from authInfo.extra; throws 401 when absent. */
  userIdFrom(extra: { authInfo?: AuthInfo }): string;
  /** Run a tool body, turning an OpError into a clean tool error. */
  run(fn: () => Promise<unknown>): Promise<ToolResult>;
  /** run() plus a per-user rate limit, for tools that write. */
  gated(
    extra: { authInfo?: AuthInfo },
    bucket: string,
    limit: number,
    fn: (userId: string) => Promise<unknown>,
  ): Promise<ToolResult>;
}

const currencyArg = z
  .string()
  .trim()
  .max(10)
  .describe("ISO-4217 code, for example USD, EUR, GBP. Validated against the real ISO list.");

// ── Operations ─────────────────────────────────────────────────────────────

async function setDealAmount(
  userId: string,
  args: { entryId: string; amount: number | string | null; currency?: string; expectedCloseDate?: string },
) {
  const entry = await prisma.pipelineEntry.findUnique({ where: { id: args.entryId } });
  if (!entry || entry.userId !== userId) throw new OpError("Deal not found", 404);

  const base = await reportingCurrencyOf(userId);
  // Re-resolves the rate because amount (or currency) is moving, and reads the
  // unchanged one back off the row in the same call.
  const money = await moneyUpdate(
    userId,
    entry,
    { amount: args.amount, ...(args.currency !== undefined ? { currency: args.currency } : {}) },
    base,
  );

  const updated = await prisma.pipelineEntry.update({
    where: { id: args.entryId },
    data: {
      ...(money ?? {}),
      ...(args.expectedCloseDate !== undefined
        ? { expectedCloseDate: args.expectedCloseDate ? new Date(args.expectedCloseDate) : null }
        : {}),
      lastActivityAt: new Date(),
    },
  });

  const serialized = serializeMoney(updated);
  return {
    entryId: updated.id,
    pipelineId: updated.pipelineId,
    stage: updated.stage,
    reportingCurrency: base,
    ...serialized,
    // Say it out loud when the deal cannot join a total, instead of letting
    // the agent assume it did.
    warning: serialized.converted
      ? null
      : updated.amount === null
        ? null
        : `No exchange rate from ${updated.currency ?? "that currency"} into ${base}, so this deal is NOT included in any total. Add a manual rate in Settings to include it.`,
  };
}

function stageScope(openOnly: boolean | undefined): Prisma.PipelineEntryWhereInput | undefined {
  return openOnly ? { stage: { notIn: CLOSED_STAGES } } : undefined;
}

async function pipelineForecast(userId: string, args: { pipelineId?: string }) {
  if (args.pipelineId) {
    const p = await prisma.pipeline.findUnique({ where: { id: args.pipelineId } });
    if (!p || p.userId !== userId) throw new OpError("Pipeline not found", 404);
  }
  const base = await reportingCurrencyOf(userId);
  const scope: Prisma.PipelineEntryWhereInput | undefined = args.pipelineId
    ? { pipelineId: args.pipelineId }
    : undefined;

  const [all, open, won] = await Promise.all([
    moneyTotals(userId, base, scope),
    moneyTotals(userId, base, andWhere(scope, { stage: { notIn: CLOSED_STAGES } })),
    moneyTotals(userId, base, andWhere(scope, { stage: PipelineStage.WON })),
  ]);

  const missing = Math.max(all.unconverted, open.unconverted, won.unconverted);
  return {
    reportingCurrency: base,
    openPipeline: open,
    won,
    all,
    // The instruction to the agent, carried with the data so it cannot be
    // read as a complete number by accident.
    mustDisclose: missing > 0,
    disclosure: all.disclosure,
  };
}

async function listDeals(
  userId: string,
  args: { pipelineId?: string; limit?: number; direction?: "desc" | "asc"; openOnly?: boolean },
) {
  const base = await reportingCurrencyOf(userId);
  const scope = andWhere(
    args.pipelineId ? { pipelineId: args.pipelineId } : undefined,
    stageScope(args.openOnly),
  );

  const [rows, totals] = await Promise.all([
    dealsByValue(userId, base, { limit: args.limit, direction: args.direction, scope }),
    moneyTotals(userId, base, scope),
  ]);

  return {
    reportingCurrency: base,
    deals: rows.map((r) => ({
      entryId: r.id,
      pipelineId: r.pipelineId,
      stage: r.stage,
      conversationStatus: r.conversationStatus,
      dealScore: r.dealScore,
      expectedCloseDate: r.expectedCloseDate ? r.expectedCloseDate.toISOString() : null,
      contact: r.contact,
      ...serializeMoney(r),
    })),
    total: totals,
    // Ranking can only include deals that have a value in the reporting
    // currency; the rest are counted here so the agent can say so.
    excludedFromRanking: totals.unconverted,
    mustDisclose: totals.unconverted > 0,
    disclosure: totals.disclosure,
  };
}

// ── Registration ───────────────────────────────────────────────────────────

export function registerDealTools(server: McpServer, ctx: DealToolsContext): void {
  server.tool(
    "set_deal_amount",
    "Set what a pipeline deal is worth: the amount the customer would actually pay, in the currency they pay in. The amount is stored unconverted and a second figure is computed once in the operator's reporting currency and FROZEN at today's rate, so totals never move on their own. Pass currency as an ISO-4217 code (USD, EUR, GBP); it is validated against the real ISO list, so an invented code is rejected rather than saved. Pass amount null to clear a deal's value. If no exchange rate exists into the operator's reporting currency, the deal is saved but returns a warning and is EXCLUDED from every total until a rate is added - report that warning to the operator, never treat it as saved-and-counted.",
    {
      entryId: z.string().describe("Pipeline entry id (from get_pipeline or list_deals_by_value)"),
      amount: z
        .union([z.number(), z.string()])
        .nullable()
        .describe("What the customer pays, in `currency`. Null clears the value."),
      currency: currencyArg.optional().describe("Defaults to the deal's existing currency, then the operator's reporting currency."),
      expectedCloseDate: z.string().optional().describe("ISO date the deal is expected to close"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args, extra) =>
      ctx.gated(extra, "set_deal_amount", 120, (userId) =>
        setDealAmount(userId, {
          entryId: args.entryId,
          amount: args.amount,
          currency: args.currency ? (normalizeCurrency(args.currency) ?? args.currency) : undefined,
          expectedCloseDate: args.expectedCloseDate,
        }),
      ),
  );

  server.tool(
    "get_pipeline_forecast",
    "Deal value totals in the operator's reporting currency: open pipeline (everything not won or lost), won, and all deals. Every total is summed from the frozen converted figure only, so a total NEVER silently mixes currencies. Each total carries `unconverted`, the number of deals with a real value that no exchange rate could bring into the reporting currency, and they are excluded from the sum, not counted as zero. When `mustDisclose` is true you MUST tell the operator the total is partial and how many deals are missing, using the `disclosure` sentence - reporting the total on its own is reporting a wrong number. Omit pipelineId for the whole book.",
    {
      pipelineId: z.string().optional().describe("Limit to one pipeline. Omit for every deal."),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ pipelineId }, extra) => ctx.run(() => pipelineForecast(ctx.userIdFrom(extra), { pipelineId })),
  );

  server.tool(
    "list_deals_by_value",
    "List deals ranked by value in the operator's reporting currency, biggest first by default. Ranking uses the frozen converted figure, never the raw amount, so a 900,000 JPY deal is not ranked above a 50,000 USD one. Deals with no exchange rate into the reporting currency CANNOT be ranked and are left out; `excludedFromRanking` says how many, and when `mustDisclose` is true you must surface that alongside the list. Set openOnly to rank live deals only.",
    {
      pipelineId: z.string().optional().describe("Limit to one pipeline"),
      limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 25)"),
      direction: z.enum(["desc", "asc"]).optional().describe("desc = biggest first (default)"),
      openOnly: z.boolean().optional().describe("Exclude won and lost deals"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args, extra) => ctx.run(() => listDeals(ctx.userIdFrom(extra), args)),
  );
}
