import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // Rate limiting by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const rateLimit = checkRateLimit(`clerk-webhook:${ip}`, 100, 60_000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    // Verify webhook signature
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error("CLERK_WEBHOOK_SECRET is not set");
      return NextResponse.json(
        { error: "Server misconfiguration" },
        { status: 500 }
      );
    }

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        { error: "Missing svix headers" },
        { status: 401 }
      );
    }

    const rawBody = await req.text();

    const wh = new Webhook(secret);
    let payload: { type: string; data: Record<string, unknown> };

    try {
      payload = wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as typeof payload;
    } catch {
      console.error("Clerk webhook signature verification failed");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const { type, data } = payload;

    if (type === "user.created") {
      await db.insert(users).values({
        clerkId: data.id as string,
        email:
          (
            data.email_addresses as Array<{ email_address: string }>
          )?.[0]?.email_address ?? "",
        firstName: data.first_name as string | undefined,
        lastName: data.last_name as string | undefined,
        imageUrl: data.image_url as string | undefined,
        role: "client",
      });
    }

    if (type === "user.updated") {
      await db
        .update(users)
        .set({
          email: (
            data.email_addresses as Array<{ email_address: string }>
          )?.[0]?.email_address,
          firstName: data.first_name as string | undefined,
          lastName: data.last_name as string | undefined,
          imageUrl: data.image_url as string | undefined,
          updatedAt: new Date(),
        })
        .where(eq(users.clerkId, data.id as string));
    }

    if (type === "user.deleted") {
      await db.delete(users).where(eq(users.clerkId, data.id as string));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Clerk webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
