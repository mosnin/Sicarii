// Platform admin: Scalar operators who run the house, not workspace admins.
// They get unlimited usage (rate limits still apply) and the /admin console
// for users, credits, refunds, and billing help.
//
// Bootstrap: set ADMIN_EMAILS to a comma-separated list of emails. On the
// next signed-in request those accounts are stamped role="admin". After that
// the role column is the source of truth; the env list stays as a backstop
// so a mistaken demotion can be undone without a SQL console.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(user: {
  role?: string | null;
  email?: string | null;
}): boolean {
  if (user.role === "admin") return true;
  const email = user.email?.trim().toLowerCase();
  return Boolean(email && adminEmails().includes(email));
}

/** Stamp role=admin when the env list says so. Idempotent, never demotes. */
export async function ensureAdminRole<T extends { id: string; role: string; email: string }>(
  user: T,
): Promise<T> {
  if (user.role === "admin") return user;
  if (!isPlatformAdmin(user)) return user;
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "admin" },
  });
  return { ...user, role: "admin" };
}

/**
 * An account skips the credit meter only when THAT account is a platform
 * admin (personal row with role=admin / ADMIN_EMAILS, or a workspace the
 * admin created for their own businesses, which we stamp role=admin).
 * A customer workspace stays metered even if a staff admin joins it for
 * support; otherwise one membership would zero the customer's bill.
 * Rate limits still apply either way.
 */
export async function accountIsUnlimited(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  });
  return Boolean(user && isPlatformAdmin(user));
}

export function adminForbidden(): NextResponse {
  return NextResponse.json({ error: "Admin only" }, { status: 403 });
}

export async function recordAdminAction(opts: {
  adminId: string;
  targetUserId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.adminAction.create({
      data: {
        adminId: opts.adminId,
        targetUserId: opts.targetUserId ?? null,
        action: opts.action,
        detail: (opts.detail as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  } catch (e) {
    console.warn("[admin] action log failed", e);
  }
}
