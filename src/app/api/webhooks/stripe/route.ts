import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLANS, refillToAllotment, type PlanName } from "@/lib/credits";
import { planForPriceId, verifyStripeSignature } from "@/lib/stripe";

// Stripe billing webhook. Verifies the Stripe-Signature header against
// STRIPE_WEBHOOK_SECRET, then applies plan changes:
//   - checkout.session.completed   -> upgrade the user, refill credits, store
//                                      the Stripe customer id
//   - invoice.paid (cycle renewal) -> refill the meter for the current plan
//   - customer.subscription.updated-> mid-cycle plan switch (portal/proration)
//   - customer.subscription.deleted-> drop back to free
// /api/webhooks(.*) is public in src/proxy.ts; the signature is the auth.

const RESET_MS = 30 * 24 * 60 * 60 * 1000;

type StripeObject = Record<string, unknown>;

function customerIdOf(obj: StripeObject): string | undefined {
  const c = obj.customer;
  return typeof c === "string" ? c : undefined;
}

// The Price id on a subscription's first line item, used to tell which plan a
// subscription currently sits on after an update.
function currentPriceId(obj: StripeObject): string | undefined {
  const items = obj.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  const id = items?.data?.[0]?.price?.id;
  return typeof id === "string" ? id : undefined;
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

    let event: { id?: string; type?: string; data?: { object?: StripeObject } };
    try {
      event = JSON.parse(rawBody) as typeof event;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const type = event.type ?? "";
    const obj = event.data?.object ?? {};

    // Idempotency: Stripe delivers at-least-once and retries on any non-2xx.
    // Record the event id (its PK) before applying any mutation; a duplicate
    // delivery fails the insert and is acknowledged without re-granting credits.
    if (event.id) {
      try {
        await prisma.processedEvent.create({ data: { id: event.id } });
      } catch {
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    // Initial purchase: a Checkout completed in subscription mode.
    if (type === "checkout.session.completed") {
      const { userId, plan } = metaOf(obj);
      if (!userId || !plan || !(plan in PLANS)) {
        console.warn("[stripe] checkout.session.completed missing userId/plan metadata");
        return NextResponse.json({ received: true });
      }
      const customerId = customerIdOf(obj);
      // Set plan + customer id; refill uses GREATEST so existing top-ups survive.
      await prisma.user.updateMany({
        where: { id: userId },
        data: {
          plan,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
        },
      });
      await refillToAllotment(userId, plan);
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
          // Refill the plan allotment but keep any mid-cycle top-ups (GREATEST),
          // so a renewal never destroys credits the user paid extra for.
          await refillToAllotment(user.id, user.plan);
        }
      }
      return NextResponse.json({ received: true });
    }

    // Mid-cycle plan switch (e.g. an upgrade/downgrade through Stripe's customer
    // portal). Only act when the plan actually changed, so unrelated updates
    // (cancel_at_period_end toggles, payment-method or card changes) never
    // refill the meter. The proration invoice carries billing_reason
    // "subscription_update", which the invoice.paid handler ignores, so credit
    // is granted here exactly once.
    if (type === "customer.subscription.updated") {
      const status = typeof obj.status === "string" ? obj.status : "";
      if (status !== "active" && status !== "trialing") {
        return NextResponse.json({ received: true });
      }
      const newPlan = planForPriceId(currentPriceId(obj));
      if (!newPlan) return NextResponse.json({ received: true });

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
        console.warn("[stripe] subscription.updated with no resolvable user");
        return NextResponse.json({ received: true });
      }

      const user = await prisma.user.findUnique({
        where: { id: resolvedId },
        select: { plan: true },
      });
      if (user && user.plan !== newPlan) {
        // Set new plan; refill uses GREATEST so mid-cycle top-ups are preserved.
        await prisma.user.update({
          where: { id: resolvedId },
          data: { plan: newPlan },
        });
        await refillToAllotment(resolvedId, newPlan);
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
