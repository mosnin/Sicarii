import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-utils";
import {
  adminForbidden,
  ensureAdminRole,
  isPlatformAdmin,
  recordAdminAction,
} from "@/lib/admin";
import { addCredits, applyPlan, type PaidPlanName, PLAN_USD, PLANS } from "@/lib/credits";
import { OpError } from "@/lib/crm-operations";
import {
  createBillingPortalSession,
  createRefund,
  listCustomerCharges,
  stripeConfigured,
} from "@/lib/stripe";

const PAID = Object.keys(PLAN_USD) as PaidPlanName[];
const ALL_PLANS = Object.keys(PLANS);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("credits"),
    credits: z.number().int().min(1).max(1_000_000),
    note: z.string().trim().max(400).optional(),
  }),
  z.object({
    action: z.literal("plan"),
    plan: z.string().min(1),
  }),
  z.object({
    action: z.literal("role"),
    role: z.enum(["admin", "member"]),
  }),
  z.object({
    action: z.literal("refund"),
    chargeId: z.string().min(1).optional(),
    paymentIntentId: z.string().min(1).optional(),
    amountCents: z.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal("portal"),
  }),
]);

async function requireAdmin() {
  const ctx = await getAuthContext();
  const actor = await ensureAdminRole(ctx.actor);
  if (!isPlatformAdmin(actor)) throw adminForbidden();
  return { ...ctx, actor };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        clerkId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        plan: true,
        creditsRemaining: true,
        creditsResetAt: true,
        stripeCustomerId: true,
        accountType: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            contacts: true,
            entities: true,
            apiKeys: true,
            memberships: true,
            members: true,
            segments: true,
            pipelines: true,
          },
        },
      },
    });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [ledger, workspaces, actions] = await Promise.all([
      prisma.creditLedger.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      user.accountType === "user"
        ? prisma.teamMember.findMany({
            where: { userId: id },
            include: { workspace: { select: { id: true, firstName: true, plan: true, creditsRemaining: true } } },
          })
        : prisma.teamMember.findMany({
            where: { workspaceId: id },
            include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          }),
      prisma.adminAction.findMany({
        where: { targetUserId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    let charges: unknown[] = [];
    if (user.stripeCustomerId && stripeConfigured()) {
      const listed = await listCustomerCharges(user.stripeCustomerId, 20);
      if ("charges" in listed) charges = listed.charges;
    }

    return NextResponse.json({ user, ledger, workspaces, actions, charges });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/admin/users/[id]", e);
    return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdmin();
    const { id } = await params;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid admin action" }, { status: 400 });
    const body = parsed.data;

    if (body.action === "credits") {
      const balance = await addCredits(id, body.credits, {
        action: "admin_grant",
        ref: `admin-grant:${ctx.actor.id}:${id}:${Date.now()}`,
      });
      await recordAdminAction({
        adminId: ctx.actor.id,
        targetUserId: id,
        action: "grant_credits",
        detail: { credits: body.credits, note: body.note, balance },
      });
      return NextResponse.json({ ok: true, creditsRemaining: balance });
    }

    if (body.action === "plan") {
      if (!ALL_PLANS.includes(body.plan)) {
        return NextResponse.json({ error: `Unknown plan: ${body.plan}` }, { status: 400 });
      }
      if ((PAID as string[]).includes(body.plan)) {
        await applyPlan(id, body.plan as PaidPlanName, {
          ref: `admin-plan:${ctx.actor.id}:${id}:${body.plan}:${Date.now()}`,
        });
      } else {
        await prisma.user.update({ where: { id }, data: { plan: body.plan } });
      }
      await recordAdminAction({
        adminId: ctx.actor.id,
        targetUserId: id,
        action: "set_plan",
        detail: { plan: body.plan },
      });
      return NextResponse.json({ ok: true, plan: body.plan });
    }

    if (body.action === "role") {
      if (target.accountType !== "user") {
        return NextResponse.json({ error: "Only personal accounts have a platform role" }, { status: 400 });
      }
      if (target.id === ctx.actor.id && body.role !== "admin") {
        return NextResponse.json({ error: "You cannot demote yourself" }, { status: 400 });
      }
      await prisma.user.update({ where: { id }, data: { role: body.role } });
      await recordAdminAction({
        adminId: ctx.actor.id,
        targetUserId: id,
        action: "set_role",
        detail: { role: body.role },
      });
      return NextResponse.json({ ok: true, role: body.role });
    }

    if (body.action === "refund") {
      const result = await createRefund({
        chargeId: body.chargeId,
        paymentIntentId: body.paymentIntentId,
        amountCents: body.amountCents,
      });
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      await recordAdminAction({
        adminId: ctx.actor.id,
        targetUserId: id,
        action: "refund",
        detail: {
          refundId: result.refundId,
          status: result.status,
          chargeId: body.chargeId,
          paymentIntentId: body.paymentIntentId,
          amountCents: body.amountCents,
        },
      });
      return NextResponse.json({ ok: true, refund: result });
    }

    if (body.action === "portal") {
      if (!target.stripeCustomerId) {
        return NextResponse.json({ error: "This account has no Stripe customer" }, { status: 400 });
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz";
      const result = await createBillingPortalSession({
        customerId: target.stripeCustomerId,
        returnUrl: `${appUrl}/admin/${id}`,
      });
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      await recordAdminAction({
        adminId: ctx.actor.id,
        targetUserId: id,
        action: "billing_portal",
      });
      return NextResponse.json({ url: result.url });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/admin/users/[id]", e);
    return NextResponse.json({ error: "Admin action failed" }, { status: 500 });
  }
}
