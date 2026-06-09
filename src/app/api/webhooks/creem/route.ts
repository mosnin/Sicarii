import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLANS, type PlanName } from "@/lib/credits";

// Creem.io billing webhook. Verifies the creem-signature header (HMAC-SHA256
// hex of the raw body with CREEM_WEBHOOK_SECRET), then applies plan changes:
// a completed checkout / active subscription upgrades the user and refills
// their credits; a canceled/expired subscription drops them back to free.
// /api/webhooks(.*) is public in src/proxy.ts; the signature is the auth.

function verifySignature(rawBody: string, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Metadata = { userId?: string; plan?: string };

// Creem payload shapes vary by event; read metadata + customer defensively.
function extract(payload: Record<string, unknown>): {
  metadata: Metadata;
  customerId?: string;
} {
  const candidates: unknown[] = [
    payload.object,
    (payload.data as Record<string, unknown> | undefined)?.object,
    payload.data,
    payload,
  ];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const obj = c as Record<string, unknown>;
    const meta = obj.metadata;
    if (meta && typeof meta === "object") {
      const customer = obj.customer;
      const customerId =
        typeof customer === "string"
          ? customer
          : customer && typeof customer === "object"
            ? ((customer as Record<string, unknown>).id as string | undefined)
            : (obj.customer_id as string | undefined);
      return { metadata: meta as Metadata, customerId };
    }
  }
  return { metadata: {} };
}

export async function POST(req: Request) {
  try {
    const secret = process.env.CREEM_WEBHOOK_SECRET;
    if (!secret) {
      console.error("CREEM_WEBHOOK_SECRET is not set");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const signature = req.headers.get("creem-signature");
    const rawBody = await req.text();
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const eventType = String(payload.eventType ?? payload.type ?? payload.event ?? "");
    const { metadata, customerId } = extract(payload);

    const upgrades =
      eventType.includes("checkout.completed") ||
      eventType.includes("subscription.active") ||
      eventType.includes("subscription.paid");
    const downgrades =
      eventType.includes("subscription.canceled") ||
      eventType.includes("subscription.cancelled") ||
      eventType.includes("subscription.expired");

    if (upgrades) {
      const userId = metadata.userId;
      const plan = metadata.plan;
      if (!userId || !plan || !(plan in PLANS)) {
        console.warn("[creem] upgrade event missing userId/plan metadata", eventType);
        return NextResponse.json({ received: true });
      }
      await prisma.user.updateMany({
        where: { id: userId },
        data: {
          plan,
          creditsRemaining: PLANS[plan as PlanName].credits,
          creditsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ...(customerId ? { creemCustomerId: customerId } : {}),
        },
      });
      return NextResponse.json({ received: true });
    }

    if (downgrades) {
      // Resolve the user by metadata first, then by stored customer id.
      const userId =
        metadata.userId ??
        (customerId
          ? (
              await prisma.user.findFirst({
                where: { creemCustomerId: customerId },
                select: { id: true },
              })
            )?.id
          : undefined);
      if (!userId) {
        console.warn("[creem] downgrade event with no resolvable user", eventType);
        return NextResponse.json({ received: true });
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { creditsRemaining: true },
      });
      if (user) {
        await prisma.user.update({
          where: { id: userId },
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
    console.error("Creem webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
