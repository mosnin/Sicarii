import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import {
  SOCIAL_PLATFORMS,
  createSocialMonitor,
  listSocialMonitors,
} from "@/lib/social-opportunities";

// GET /api/social/monitors - this account's saved social watches.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const monitors = await listSocialMonitors(user.id);
    return NextResponse.json({ monitors });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/social/monitors", e);
    return NextResponse.json({ error: "Failed to load social monitors" }, { status: 500 });
  }
}

// POST /api/social/monitors - create a watch. Anything it finds lands in the
// review queue; a watch never writes a contact (see docs/engineering/socq-integration.md).
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = await checkRateLimit(`social-monitor-create:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const platform = typeof body.platform === "string" ? body.platform.toUpperCase() : "";
    if (!(SOCIAL_PLATFORMS as readonly string[]).includes(platform)) {
      return NextResponse.json(
        { error: `platform must be one of: ${SOCIAL_PLATFORMS.join(", ")}` },
        { status: 400 },
      );
    }

    const monitor = await createSocialMonitor(user.id, {
      name: typeof body.name === "string" ? body.name : "",
      platform: platform as (typeof SOCIAL_PLATFORMS)[number],
      query: typeof body.query === "string" ? body.query : null,
      sourceUrls: Array.isArray(body.sourceUrls)
        ? body.sourceUrls.filter((u): u is string => typeof u === "string")
        : [],
      resultsLimit: typeof body.resultsLimit === "number" ? body.resultsLimit : undefined,
      publishedWithin: typeof body.publishedWithin === "string" ? body.publishedWithin : null,
      frequency: typeof body.frequency === "string" ? body.frequency : undefined,
    });
    return NextResponse.json({ monitor }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/social/monitors", e);
    return NextResponse.json({ error: "Failed to create social monitor" }, { status: 500 });
  }
}
