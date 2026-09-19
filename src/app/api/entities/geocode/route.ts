import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError, geocodeEntities } from "@/lib/crm-operations";

export const maxDuration = 30;

// POST /api/entities/geocode - backfill coordinates for entities that have a
// location but no lat/lng. Uses the shared geocode cache so repeated cities are
// instant; only real Nominatim calls are throttled (1 req/sec). Capped per call
// so the client can loop until `remaining` is 0.
export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    const result = await geocodeEntities(user.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/entities/geocode", e);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
