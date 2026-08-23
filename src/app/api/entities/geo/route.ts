import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// GET /api/entities/geo - entities that have coordinates, for the map.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const [entities, missing] = await Promise.all([
      prisma.entity.findMany({
        where: { userId: user.id, lat: { not: null }, lng: { not: null } },
        select: { id: true, name: true, lat: true, lng: true, location: true, domain: true, industry: true, logoUrl: true },
        take: 2000,
      }),
      prisma.entity.count({ where: { userId: user.id, lat: null, geocodedAt: null, location: { not: null } } }),
    ]);
    return NextResponse.json({ entities, missing });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to load map data" }, { status: 500 });
  }
}
