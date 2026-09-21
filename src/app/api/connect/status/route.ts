import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// Moment 4: has this workspace seen a first agent write (API key or OAuth)?
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const [key, oauth, activity] = await Promise.all([
      prisma.apiKey.findFirst({
        where: { userId: user.id, lastUsedAt: { not: null }, revokedAt: null },
        select: { lastUsedAt: true, name: true },
        orderBy: { lastUsedAt: "desc" },
      }),
      prisma.oauthToken.findFirst({
        where: {
          lastUsedAt: { not: null },
          grant: { OR: [{ userId: user.id }, { accountId: user.id }] },
        },
        select: { lastUsedAt: true },
        orderBy: { lastUsedAt: "desc" },
      }),
      prisma.activity.findFirst({
        where: { userId: user.id, actorId: { not: null } },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const at = key?.lastUsedAt ?? oauth?.lastUsedAt ?? activity?.createdAt ?? null;
    return NextResponse.json({
      connected: Boolean(at),
      firstWriteAt: at,
      via: key ? "api_key" : oauth ? "oauth" : activity ? "activity" : null,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/connect/status", e);
    return NextResponse.json({ error: "Failed to load connect status" }, { status: 500 });
  }
}
