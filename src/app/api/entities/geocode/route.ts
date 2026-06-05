import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { geocode } from "@/lib/geocode";

export const maxDuration = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /api/entities/geocode - backfill coordinates for entities that have a
// location but no lat/lng. Throttled to respect Nominatim (1 req/sec); capped
// per call so the client can loop until `remaining` is 0.
export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    const batch = await prisma.entity.findMany({
      where: { userId: user.id, lat: null, geocodedAt: null, location: { not: null } },
      select: { id: true, location: true },
      take: 12,
    });

    let geocoded = 0;
    for (const e of batch) {
      const g = e.location ? await geocode(e.location) : null;
      await prisma.entity.update({
        where: { id: e.id },
        data: g ? { lat: g.lat, lng: g.lng, geocodedAt: new Date() } : { geocodedAt: new Date() },
      });
      if (g) geocoded++;
      await sleep(1100);
    }

    const remaining = await prisma.entity.count({
      where: { userId: user.id, lat: null, geocodedAt: null, location: { not: null } },
    });
    return NextResponse.json({ geocoded, processed: batch.length, remaining });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities/geocode", e);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
