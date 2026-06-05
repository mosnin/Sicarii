import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// GET /api/discover/recent — last 20 contacts + entities that arrived via
// Synthoz (webhook or direct discover), plus pending/resolved job counts.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    const [contacts, entities, pendingJobs, resolvedJobs] = await Promise.all([
      prisma.contact.findMany({
        where: {
          userId: user.id,
          source: { in: ["synthoz-webhook", "discover"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          name: true,
          email: true,
          company: true,
          title: true,
          source: true,
          createdAt: true,
        },
      }),
      prisma.entity.findMany({
        where: {
          userId: user.id,
          source: { in: ["synthoz-webhook", "discover"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          name: true,
          domain: true,
          location: true,
          source: true,
          createdAt: true,
        },
      }),
      prisma.synthozJob.count({
        where: { userId: user.id, status: "pending" },
      }),
      prisma.synthozJob.count({
        where: { userId: user.id, status: "resolved" },
      }),
    ]);

    // Merge and sort by createdAt desc
    const results = [
      ...contacts.map((c) => ({ ...c, kind: "contact" as const })),
      ...entities.map((e) => ({ ...e, kind: "entity" as const })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20);

    return NextResponse.json({ results, pendingJobs, resolvedJobs });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to load recent results." }, { status: 500 });
  }
}
