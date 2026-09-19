import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { createEntity, findEntityByDomainOrName, OpError, updateEntity } from "@/lib/crm-operations";

const schema = z.object({
  domain: z.string().trim().min(1).max(255),
  key: z.string().trim().min(1).max(80),
  data: z.unknown(),
  name: z.string().trim().max(200).optional(),
});

function norm(d: string) {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

// POST /api/entities/upsert-enrichment
// Match an entity by domain (create it if absent), then merge the provider
// payload under enrichment[key]. This is how enrichment tools (tech stack,
// funding, firmographics, …) attach data to a company instead of creating junk.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const domain = norm(parsed.data.domain);
    const { key, data, name } = parsed.data;

    // Never attach empty/null data (which would create a junk "null" record).
    const isEmpty =
      data == null ||
      (Array.isArray(data) && data.length === 0) ||
      (typeof data === "object" && !Array.isArray(data) && Object.keys(data as object).length === 0);
    if (isEmpty) {
      return NextResponse.json({ error: "No data to attach for this domain." }, { status: 404 });
    }

    const existing = await findEntityByDomainOrName(user.id, { domain });

    const mergedEnrichment = {
      ...(existing && existing.enrichment && typeof existing.enrichment === "object" && !Array.isArray(existing.enrichment)
        ? (existing.enrichment as Record<string, unknown>)
        : {}),
      [key]: data,
    };

    if (existing) {
      const entity = await updateEntity(user.id, existing.id, {
        enrichment: mergedEnrichment,
        status: "ENRICHED",
      });
      return NextResponse.json({ entity, created: false });
    }

    const entity = await createEntity(user.id, {
      name: name?.trim() || domain,
      domain,
      website: `https://${domain}`,
      status: "ENRICHED",
      source: "discover:enrichment",
      enrichment: mergedEnrichment,
    });
    return NextResponse.json({ entity, created: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/entities/upsert-enrichment", e);
    return NextResponse.json({ error: "Failed to attach enrichment" }, { status: 500 });
  }
}
