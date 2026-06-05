import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { geocodeCached } from "@/lib/geocode";

export const maxDuration = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /api/entities/geocode - backfill coordinates for entities that have a
// location but no lat/lng. Uses the shared geocode cache so repeated cities are
// instant; only real Nominatim calls are throttled (1 req/sec). Capped per call
// so the client can loop until `remaining` is 0.
export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    const batch = await prisma.entity.findMany({
      where: { userId: user.id, lat: null, geocodedAt: null, location: { not: null } },
      select: { id: true, location: true },
      take: 20,
    });

    let geocoded = 0;
    for (const e of batch) {
      const { result: g, cached } = e.location
        ? await geocodeCached(e.location)
        : { result: null, cached: true };
      await prisma.entity.update({
        where: { id: e.id },
        data: g ? { lat: g.lat, lng: g.lng, geocodedAt: new Date() } : { geocodedAt: new Date() },
      });
      if (g) geocoded++;
      // Only the public Nominatim endpoint needs the 1 req/sec courtesy delay;
      // cache hits resolve instantly.
      if (!cached) await sleep(1100);
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
