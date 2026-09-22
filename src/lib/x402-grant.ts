// Shared verify / settle / credit grant for every x402 money-in path
// (packs, per-call SKUs, plans, MCP buy tools). One nonce, one credit.
//
// Order matters for funds safety:
//   1. verify the payload against OUR requirements (amount, asset, payTo, resource)
//   2. refuse a nonce that already credited a different account
//   3. settle on-chain (or skip if we already recorded that settlement)
//   4. persist X402Settlement (the durable "money moved" marker)
//   5. grant credits / apply the plan (idempotent on the nonce)
//
// If step 5 fails after step 4, a client retry finds the settlement, skips
// settle (the nonce is spent), and grants. Without step 4, a retry would
// attempt settle, get a spent-nonce error, and never credit.

import { prisma } from "@/lib/prisma";
import {
  addCredits,
  alreadyCredited,
  alreadyCreditedAny,
  applyPlan,
  type PaidPlanName,
} from "@/lib/credits";
import {
  grantAfterSettle,
  paymentRef,
  settlePayment,
  verifyPayment,
  type PaymentPayload,
  type PaymentRequirements,
} from "@/lib/x402";

export type CreditGrantResult =
  | {
      ok: true;
      credited: number;
      balance: number;
      duplicate: boolean;
      transaction?: string;
      responseHeader?: string;
    }
  | { ok: false; reason: string };

export type PlanGrantResult =
  | {
      ok: true;
      duplicate: boolean;
      transaction?: string;
      responseHeader?: string;
    }
  | { ok: false; reason: string };

type Prepared =
  | { status: "reject"; reason: string }
  | { status: "already_granted"; balance: number }
  | {
      status: "ready";
      ref: string;
      transaction?: string;
      responseHeader?: string;
    };

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  );
}

async function persistSettlement(row: {
  ref: string;
  userId: string;
  transaction: string;
  kind: "credits" | "plan";
  amount: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.x402Settlement.create({ data: row });
    return { ok: true };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await prisma.x402Settlement.findUnique({
      where: { ref: row.ref },
      select: { userId: true },
    });
    if (existing && existing.userId !== row.userId) {
      return { ok: false, reason: "This payment already credited another account." };
    }
    return { ok: true };
  }
}

async function prepareSettlement(opts: {
  userId: string;
  payload: PaymentPayload;
  requirements: PaymentRequirements;
  kind: "credits" | "plan";
  amount: string;
}): Promise<Prepared> {
  const verified = await verifyPayment(opts.payload, opts.requirements);
  if (!verified.ok) return { status: "reject", reason: `Payment invalid: ${verified.reason}` };

  const ref = paymentRef(opts.payload);
  if (!ref) return { status: "reject", reason: "Payment payload missing nonce." };

  const settlement = await prisma.x402Settlement.findUnique({
    where: { ref },
    select: { userId: true, transaction: true },
  });
  if (settlement && settlement.userId !== opts.userId) {
    return { status: "reject", reason: "This payment already credited another account." };
  }

  const prior = await alreadyCreditedAny(ref);
  if (prior) {
    if (prior.userId !== opts.userId) {
      return { status: "reject", reason: "This payment already credited another account." };
    }
    return { status: "already_granted", balance: prior.balanceAfter };
  }

  if (settlement) {
    return { status: "ready", ref, transaction: settlement.transaction };
  }

  const settled = await settlePayment(opts.payload, opts.requirements);
  if (!settled.ok) {
    // A twin request may have settled and written the marker (or the grant)
    // while we were in flight. Recover instead of telling the payer it failed.
    const racedCredit = await alreadyCreditedAny(ref);
    if (racedCredit) {
      if (racedCredit.userId !== opts.userId) {
        return { status: "reject", reason: "This payment already credited another account." };
      }
      return { status: "already_granted", balance: racedCredit.balanceAfter };
    }
    const racedSettle = await prisma.x402Settlement.findUnique({
      where: { ref },
      select: { userId: true, transaction: true },
    });
    if (racedSettle) {
      if (racedSettle.userId !== opts.userId) {
        return { status: "reject", reason: "This payment already credited another account." };
      }
      return { status: "ready", ref, transaction: racedSettle.transaction };
    }
    return { status: "reject", reason: `Settlement failed: ${settled.reason}` };
  }

  try {
    const persisted = await grantAfterSettle(
      () =>
        persistSettlement({
          ref,
          userId: opts.userId,
          transaction: settled.transaction,
          kind: opts.kind,
          amount: opts.amount,
        }),
      {
        transaction: settled.transaction,
        userId: opts.userId,
        ref,
        amount: `settlement:${opts.kind}`,
      },
    );
    if (!persisted.ok) return { status: "reject", reason: persisted.reason };
  } catch (e) {
    console.error(
      "[x402] CRITICAL settled_but_unrecorded " +
        JSON.stringify({
          transaction: settled.transaction,
          userId: opts.userId,
          ref,
          error: String(e),
        }),
    );
  }

  return {
    status: "ready",
    ref,
    transaction: settled.transaction,
    responseHeader: settled.responseHeader,
  };
}

export async function settleAndCredit(opts: {
  userId: string;
  credits: number;
  payload: PaymentPayload;
  requirements: PaymentRequirements;
  ledgerAction: string;
}): Promise<CreditGrantResult> {
  const prepared = await prepareSettlement({
    userId: opts.userId,
    payload: opts.payload,
    requirements: opts.requirements,
    kind: "credits",
    amount: String(opts.credits),
  });
  if (prepared.status === "reject") return { ok: false, reason: prepared.reason };
  if (prepared.status === "already_granted") {
    return { ok: true, credited: 0, balance: prepared.balance, duplicate: true };
  }

  const already = await alreadyCredited(opts.userId, prepared.ref);
  const balance = await grantAfterSettle(
    () => addCredits(opts.userId, opts.credits, { action: opts.ledgerAction, ref: prepared.ref }),
    {
      transaction: prepared.transaction ?? "unknown",
      userId: opts.userId,
      ref: prepared.ref,
      amount: String(opts.credits),
    },
  );

  return {
    ok: true,
    credited: already !== null ? 0 : opts.credits,
    balance,
    duplicate: already !== null,
    transaction: prepared.transaction,
    responseHeader: prepared.responseHeader,
  };
}

export async function settleAndApplyPlan(opts: {
  userId: string;
  plan: PaidPlanName;
  payload: PaymentPayload;
  requirements: PaymentRequirements;
}): Promise<PlanGrantResult> {
  const prepared = await prepareSettlement({
    userId: opts.userId,
    payload: opts.payload,
    requirements: opts.requirements,
    kind: "plan",
    amount: opts.plan,
  });
  if (prepared.status === "reject") return { ok: false, reason: prepared.reason };
  if (prepared.status === "already_granted") {
    return { ok: true, duplicate: true };
  }

  await grantAfterSettle(
    () => applyPlan(opts.userId, opts.plan, { ref: prepared.ref }),
    {
      transaction: prepared.transaction ?? "unknown",
      userId: opts.userId,
      ref: prepared.ref,
      amount: `plan:${opts.plan}`,
    },
  );

  return {
    ok: true,
    duplicate: false,
    transaction: prepared.transaction,
    responseHeader: prepared.responseHeader,
  };
}
