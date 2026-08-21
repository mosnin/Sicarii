// Shared verify / settle / credit grant for every x402 money-in path
// (packs, per-call SKUs, MCP buy tools). One nonce, one credit.

import { addCredits, alreadyCreditedAny } from "@/lib/credits";
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

export async function settleAndCredit(opts: {
  userId: string;
  credits: number;
  payload: PaymentPayload;
  requirements: PaymentRequirements;
  ledgerAction: string;
}): Promise<CreditGrantResult> {
  const verified = await verifyPayment(opts.payload, opts.requirements);
  if (!verified.ok) return { ok: false, reason: `Payment invalid: ${verified.reason}` };

  const ref = paymentRef(opts.payload);
  if (!ref) return { ok: false, reason: "Payment payload missing nonce." };

  const prior = await alreadyCreditedAny(ref);
  if (prior) {
    if (prior.userId !== opts.userId) {
      return { ok: false, reason: "This payment already credited another account." };
    }
    return { ok: true, credited: 0, balance: prior.balanceAfter, duplicate: true };
  }

  const settled = await settlePayment(opts.payload, opts.requirements);
  if (!settled.ok) return { ok: false, reason: `Settlement failed: ${settled.reason}` };

  const balance = await grantAfterSettle(
    () => addCredits(opts.userId, opts.credits, { action: opts.ledgerAction, ref }),
    {
      transaction: settled.transaction,
      userId: opts.userId,
      ref,
      amount: String(opts.credits),
    },
  );

  return {
    ok: true,
    credited: opts.credits,
    balance,
    duplicate: false,
    transaction: settled.transaction,
    responseHeader: settled.responseHeader,
  };
}
