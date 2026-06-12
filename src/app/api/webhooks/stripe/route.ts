import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLANS, planFor, type PlanName } from "@/lib/credits";
import { verifyStripeSignature } from "@/lib/stripe";

// Stripe billing webhook. Verifies the Stripe-Signature header against
// STRIPE_WEBHOOK_SECRET, then applies plan changes:
//   - checkout.session.completed   -> upgrade the user, refill credits, store
//                                      the Stripe customer id
//   - invoice.paid (cycle renewal) -> refill the meter for the current plan
//   - customer.subscription.deleted-> drop back to free
// /api/webhooks(.*) is public in src/proxy.ts; the signature is the auth.

const RESET_MS = 30 * 24 * 60 * 60 * 1000;

type StripeObject = Record<string, unknown>;

function customerIdOf(obj: StripeObject): string | undefined {
  const c = obj.customer;
  return typeof c === "string" ? c : undefined;
}

function metaOf(obj: StripeObject): { userId?: string; plan?: string } {
  const m = obj.metadata;
  return m && typeof m === "object" ? (m as { userId?: string; plan?: string }) : {};
}

export async function POST(req: Request) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("STRIPE_WEBHOOK_SECRET is not set");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!verifyStripeSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: { type?: string; data?: { object?: StripeObject } };
    try {
      event = JSON.parse(rawBody) as typeof event;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const type = event.type ?? "";
    const obj = event.data?.object ?? {};

    // Initial purchase: a Checkout completed in subscription mode.
    if (type === "checkout.session.completed") {
      const { userId, plan } = metaOf(obj);
      if (!userId || !plan || !(plan in PLANS)) {
        console.warn("[stripe] checkout.session.completed missing userId/plan metadata");
        return NextResponse.json({ received: true });
      }
      const customerId = customerIdOf(obj);
      await prisma.user.updateMany({
        where: { id: userId },
        data: {
          plan,
          creditsRemaining: PLANS[plan as PlanName].credits,
          creditsResetAt: new Date(Date.now() + RESET_MS),
          ...(customerId ? { stripeCustomerId: customerId } : {}),
        },
      });
      return NextResponse.json({ received: true });
    }

    // Recurring renewal: refill the meter for the user's current plan. The first
    // invoice (subscription_create) is already handled by the checkout event, so
    // only refill on later cycles to avoid double-granting.
    if (type === "invoice.paid") {
      const customerId = customerIdOf(obj);
      if (obj.billing_reason === "subscription_cycle" && customerId) {
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true, plan: true },
        });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              creditsRemaining: planFor(user.plan).credits,
              creditsResetAt: new Date(Date.now() + RESET_MS),
            },
          });
        }
      }
      return NextResponse.json({ received: true });
    }

    // Subscription ended (canceled, or churned after dunning): drop to free.
    if (type === "customer.subscription.deleted") {
      const { userId } = metaOf(obj);
      const customerId = customerIdOf(obj);
      const resolvedId =
        userId ??
        (customerId
          ? (
              await prisma.user.findFirst({
                where: { stripeCustomerId: customerId },
                select: { id: true },
              })
            )?.id
          : undefined);
      if (!resolvedId) {
        console.warn("[stripe] subscription.deleted with no resolvable user");
        return NextResponse.json({ received: true });
      }
      const user = await prisma.user.findUnique({
        where: { id: resolvedId },
        select: { creditsRemaining: true },
      });
      if (user) {
        await prisma.user.update({
          where: { id: resolvedId },
          data: {
            plan: "free",
            creditsRemaining: Math.min(user.creditsRemaining, PLANS.free.credits),
          },
        });
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
