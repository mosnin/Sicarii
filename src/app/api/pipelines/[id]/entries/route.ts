import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import { baseCurrencyOf, normalizeCurrency } from "@/lib/currency";
import { attributeWin } from "@/lib/variant-operations";
import { moneyUpdate, serializeMoney } from "@/lib/conversion";

const STAGES = ["NEW", "ENRICHED", "PROSPECTING", "ENGAGING", "REPLYING", "WON", "LOST"] as const;
const CONVO = ["OPEN", "AWAITING_REPLY", "STALLED", "CLOSED"] as const;

// A real ISO-4217 code, not z.string().length(3) - that happily accepts "ZZZ"
// and books a deal in a currency no rate will ever exist for.
const currencySchema = z
  .string()
  .trim()
  .max(10)
  .transform((v) => normalizeCurrency(v))
  .refine((v): v is string => v !== null, "Must be a valid ISO-4217 currency code");

// Accepts a number or a numeric string; the string form keeps a caller from
// losing precision in JSON before we ever see the figure.
const amountSchema = z.union([z.number(), z.string().trim().max(30)]);

async function ownPipeline(id: string, userId: string) {
  const p = await prisma.pipeline.findUnique({ where: { id } });
  return p && p.userId === userId ? p : null;
}

const addSchema = z.object({
  contactIds: z.array(z.string().uuid()).max(500).optional(),
  segmentId: z.string().uuid().optional(),
  // Optional opening value for every entry added in this call (a segment of
  // seats priced the same, say). Converted once and frozen onto each row.
  amount: amountSchema.optional(),
  currency: currencySchema.optional(),
  expectedCloseDate: z.string().datetime().optional(),
});

// POST - add contacts (or a whole segment) to the pipeline as NEW entries.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    if (!(await ownPipeline(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    let ids = parsed.data.contactIds ?? [];
    if (parsed.data.segmentId) {
      const seg = await prisma.segment.findUnique({
        where: { id: parsed.data.segmentId },
        include: { members: { select: { contactId: true } } },
      });
      if (seg && seg.userId === user.id) ids = [...ids, ...seg.members.map((m) => m.contactId)];
    }
    if (ids.length === 0) return NextResponse.json({ error: "No contacts to add" }, { status: 400 });

    const base = baseCurrencyOf(user);
    const money =
      parsed.data.amount !== undefined
        ? await moneyUpdate(user.id, null, { amount: parsed.data.amount, currency: parsed.data.currency ?? null }, base)
        : null;

    const owned = await prisma.contact.findMany({ where: { userId: user.id, id: { in: ids } }, select: { id: true } });
    const res = await prisma.pipelineEntry.createMany({
      data: owned.map((c) => ({
        userId: user.id,
        pipelineId: id,
        contactId: c.id,
        ...(money ?? {}),
        expectedCloseDate: parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : undefined,
      })),
      skipDuplicates: true,
    });
    return NextResponse.json({
      added: res.count,
      // Tell the caller straight away when the value could not be converted,
      // rather than letting the deals show up missing from the forecast later.
      money: money ? serializeMoney(money) : null,
      unconverted: money && money.amount !== null && money.baseAmount === null ? res.count : 0,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST pipeline entries", e);
    return NextResponse.json({ error: "Failed to add entries" }, { status: 500 });
  }
}

const patchSchema = z.object({
  entryId: z.string().uuid(),
  stage: z.enum(STAGES).optional(),
  dealScore: z.number().int().min(0).max(100).nullable().optional(),
  conversationStatus: z.enum(CONVO).optional(),
  // Money. Sending null for amount clears the deal value (and its frozen
  // rate). Omitting both amount and currency leaves the frozen rate alone.
  amount: amountSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
});

// PATCH - update one entry's stage / deal score / conversation status / value.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    if (!(await ownPipeline(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    const { entryId, amount, currency, expectedCloseDate, ...rest } = parsed.data;

    const entry = await prisma.pipelineEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.userId !== user.id || entry.pipelineId !== id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Re-resolve the rate ONLY when amount or currency actually moved, reading
    // the unchanged one back off the row in the same call. A stage move must
    // never silently re-price a deal at today's rate.
    const money = await moneyUpdate(
      user.id,
      entry,
      { ...(amount !== undefined ? { amount } : {}), ...(currency !== undefined ? { currency } : {}) },
      baseCurrencyOf(user),
    );

    const updated = await prisma.pipelineEntry.update({
      where: { id: entryId },
      data: {
        ...rest,
        ...(money ?? {}),
        ...(expectedCloseDate !== undefined
          ? { expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null }
          : {}),
        lastActivityAt: new Date(),
      },
    });

    // Revenue attribution: a deal reaching WON (from any other stage) is the
    // bandit's true reward. Credit the variant that last reached out to this
    // contact so selection optimizes for what CLOSES, not just what replies.
    // Best-effort - it must never fail the stage update.
    if (rest.stage === "WON" && entry.stage !== "WON") {
      await attributeWin(entry.contactId).catch((e) => console.warn("[pipeline] attributeWin failed", e));
    }

    return NextResponse.json({ entry: { ...updated, money: serializeMoney(updated) } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH pipeline entries", e);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}
