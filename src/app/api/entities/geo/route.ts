import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError, listGeoEntities } from "@/lib/crm-operations";

// GET /api/entities/geo - entities that have coordinates, for the map.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const { entities, missing } = await listGeoEntities(user.id);
    return NextResponse.json({ entities, missing });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Failed to load map data" }, { status: 500 });
  }
}
