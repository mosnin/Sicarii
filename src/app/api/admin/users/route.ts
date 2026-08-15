import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-utils";
import { adminForbidden, ensureAdminRole, isPlatformAdmin } from "@/lib/admin";

const PAGE = 40;

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const actor = await ensureAdminRole(ctx.actor);
    if (!isPlatformAdmin(actor)) return adminForbidden();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const accountType = searchParams.get("type") === "workspace" ? "workspace" : "user";

    const where = {
      accountType,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE,
        take: PAGE,
        select: {
          id: true,
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
          _count: { select: { contacts: true, entities: true, memberships: true, members: true } },
        },
      }),
    ]);

    return NextResponse.json({ users, total, page, pageSize: PAGE });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/admin/users", e);
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}
