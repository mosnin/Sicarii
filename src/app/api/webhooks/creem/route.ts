import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { payments, projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";

function getSignatureHeader(req: Request): string | null {
  return (
    req.headers.get("x-creem-signature") ??
    req.headers.get("x-signature") ??
    req.headers.get("webhook-signature") ??
    null
  );
}

function verifySignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    // Rate limiting by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const rateLimit = checkRateLimit(`creem-webhook:${ip}`, 100, 60_000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    // Verify webhook signature
    const secret = process.env.CREEM_WEBHOOK_SECRET;
    if (!secret) {
      console.error("CREEM_WEBHOOK_SECRET is not set");
      return NextResponse.json(
        { error: "Server misconfiguration" },
        { status: 500 }
      );
    }

    const signature = getSignatureHeader(req);
    if (!signature) {
      return NextResponse.json(
        { error: "Missing signature header" },
        { status: 401 }
      );
    }

    const rawBody = await req.text();

    if (!verifySignature(rawBody, signature, secret)) {
      console.error("Creem webhook signature verification failed");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);
    const { event, data } = body;

    if (event === "payment.completed" || event === "checkout.completed") {
      const projectId = data.metadata?.projectId;
      const creemPaymentId = data.id;

      if (!projectId) {
        return NextResponse.json({ received: true, skipped: "no projectId" });
      }

      // Idempotency check: skip if this payment is already completed
      if (creemPaymentId) {
        const existing = await db
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.creemPaymentId, creemPaymentId),
              eq(payments.status, "completed")
            )
          )
          .limit(1);

        if (existing.length > 0) {
          return NextResponse.json({
            received: true,
            skipped: "already processed",
          });
        }
      }

      // Update payment and project in a transaction-like pattern
      try {
        await db
          .update(payments)
          .set({
            status: "completed",
            creemPaymentId: creemPaymentId,
            updatedAt: new Date(),
          })
          .where(eq(payments.projectId, projectId));

        await db
          .update(projects)
          .set({
            status: "in_progress",
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId));
      } catch (dbError) {
        console.error(
          "Creem webhook: failed to update payment/project",
          {
            projectId,
            creemPaymentId,
            error: dbError instanceof Error ? dbError.message : dbError,
          }
        );
        return NextResponse.json(
          { error: "Database update failed" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Creem webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
