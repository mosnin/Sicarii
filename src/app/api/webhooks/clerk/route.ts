import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // Rate limiting by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const rateLimit = await checkRateLimit(`clerk-webhook:${ip}`, 100, 60_000);
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

    const primaryEmail =
      (data.email_addresses as Array<{ email_address: string }>)?.[0]
        ?.email_address ?? "";

    if (type === "user.created" || type === "user.updated") {
      const clerkId = data.id as string;
      await prisma.user.upsert({
        where: { clerkId },
        create: {
          clerkId,
          email: primaryEmail,
          firstName: data.first_name as string | undefined,
          lastName: data.last_name as string | undefined,
          imageUrl: data.image_url as string | undefined,
          // New signups start on the free plan with its monthly allotment.
          // Never set these in the update branch: existing users keep their
          // plan and meter (the schema default "beta" covers pre-billing rows).
          plan: "free",
          creditsRemaining: 200,
        },
        update: {
          email: primaryEmail,
          firstName: data.first_name as string | undefined,
          lastName: data.last_name as string | undefined,
          imageUrl: data.image_url as string | undefined,
        },
      });
    }

    /* ── Teams: mirror Clerk Organizations as workspace account rows ────── */

    if (type === "organization.created" || type === "organization.updated") {
      const orgId = data.id as string;
      const name = (data.name as string | undefined) ?? "Team workspace";
      await prisma.user.upsert({
        where: { clerkId: orgId },
        create: {
          clerkId: orgId,
          accountType: "workspace",
          email: "",
          firstName: name,
          imageUrl: data.image_url as string | undefined,
          plan: "free",
          creditsRemaining: 200,
        },
        // Never touch plan/meter on update: the team keeps what it bought.
        update: {
          firstName: name,
          imageUrl: data.image_url as string | undefined,
        },
      });
    }

    if (type === "organization.deleted") {
      // Symmetric to user.deleted: the workspace's data must not survive the
      // org. Fail loudly so Clerk retries a partial delete.
      const ws = await prisma.user.findUnique({
        where: { clerkId: data.id as string },
        select: { id: true, accountType: true },
      });
      if (ws && ws.accountType === "workspace") {
        try {
          await prisma.$transaction([
            prisma.pipeline.deleteMany({ where: { userId: ws.id } }),
            prisma.segment.deleteMany({ where: { userId: ws.id } }),
            prisma.user.delete({ where: { id: ws.id } }),
          ]);
        } catch (err) {
          console.error(`[clerk] organization.deleted cleanup failed for ${ws.id}`, err);
          return NextResponse.json({ error: "Deletion failed, will retry" }, { status: 500 });
        }
      }
    }

    if (
      type === "organizationMembership.created" ||
      type === "organizationMembership.updated" ||
      type === "organizationMembership.deleted"
    ) {
      const org = data.organization as { id?: string; name?: string } | undefined;
      const pub = data.public_user_data as { user_id?: string } | undefined;
      const membershipId = data.id as string | undefined;
      const role = (data.role as string | undefined) === "org:admin" ? "admin" : "member";
      const orgClerkId = org?.id;
      const memberClerkId = pub?.user_id;
      if (orgClerkId && memberClerkId) {
        const [ws, member] = await Promise.all([
          prisma.user.findUnique({ where: { clerkId: orgClerkId }, select: { id: true } }),
          prisma.user.findUnique({ where: { clerkId: memberClerkId }, select: { id: true } }),
        ]);
        // Rows may not exist yet (webhook ordering); the resolvers provision
        // membership on first sight, so a miss here is safe to skip.
        if (ws && member) {
          if (type === "organizationMembership.deleted") {
            await prisma.teamMember.deleteMany({
              where: { workspaceId: ws.id, userId: member.id },
            });
          } else {
            await prisma.teamMember.upsert({
              where: { workspaceId_userId: { workspaceId: ws.id, userId: member.id } },
              update: { role, clerkMembershipId: membershipId },
              create: {
                workspaceId: ws.id,
                userId: member.id,
                role,
                clerkMembershipId: membershipId,
              },
            });
          }
        }
      }
    }

    if (type === "user.deleted") {
      // Entity/Contact/ApiKey/Conversation/MemoryChunk/IntentMonitor/
      // ResearchSchedule cascade via FK. Segment + Pipeline use a scalar userId
      // with NO FK cascade, so they'd orphan (the user's deal data surviving
      // account deletion). Delete them explicitly; PipelineEntry/ContactSegment
      // cascade from their parent.
      const u = await prisma.user.findUnique({
        where: { clerkId: data.id as string },
        select: { id: true },
      });
      if (u) {
        // Do NOT swallow failures here: account deletion is a compliance
        // action, and a silent partial delete would leave user data retained
        // while reporting success. Failing loudly (500) makes Clerk retry.
        try {
          await prisma.$transaction([
            prisma.pipeline.deleteMany({ where: { userId: u.id } }),
            prisma.segment.deleteMany({ where: { userId: u.id } }),
            prisma.user.delete({ where: { id: u.id } }),
          ]);
        } catch (err) {
          console.error(`[clerk] user.deleted cleanup failed for ${u.id}`, err);
          return NextResponse.json({ error: "Deletion failed, will retry" }, { status: 500 });
        }
      }
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
