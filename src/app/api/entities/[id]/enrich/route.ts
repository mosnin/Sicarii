import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  enrichDomain,
  getCompanyTechStack,
  getCompanyFunding,
  getCompanyTraffic,
  isExploriumConfigured,
} from "@/lib/explorium";
import { getCompanyOverview, getCompanyNews, isPipe0Configured } from "@/lib/pipe0";

type Aspect = "firmographics" | "tech-stack" | "funding" | "traffic" | "overview" | "news";

const LABELS: Record<Aspect, string> = {
  firmographics: "Firmographics",
  "tech-stack": "Tech stack",
  funding: "Funding",
  traffic: "Website traffic",
  overview: "Overview",
  news: "Recent news",
};

function isEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object") {
    const inner = (data as { data?: unknown }).data;
    if (Array.isArray(inner)) return inner.length === 0;
    return Object.keys(data as object).length === 0;
  }
  return false;
}

// POST /api/entities/[id]/enrich  body: { type?: Aspect }  (default firmographics)
// Each aspect merges independently under enrichment[type] — enriching one aspect
// NEVER blocks enriching others. Fills empty columns where the data allows.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { type?: Aspect } | null;
    const type: Aspect = body?.type ?? "firmographics";
    if (!Object.keys(LABELS).includes(type)) {
      return NextResponse.json({ error: "Unknown enrichment type." }, { status: 400 });
    }

    const entity = await prisma.entity.findUnique({ where: { id } });
    if (!entity || entity.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const domain = entity.domain?.trim();
    if (!domain) {
      return NextResponse.json({ error: "This entity has no domain to enrich from." }, { status: 400 });
    }

    const usesExplorium = ["firmographics", "tech-stack", "funding", "traffic"].includes(type);
    if (usesExplorium && !isExploriumConfigured()) {
      return NextResponse.json({ error: "Explorium is not configured (EXPLORIUM_API_KEY missing)." }, { status: 501 });
    }
    if (!usesExplorium && !isPipe0Configured()) {
      return NextResponse.json({ error: "Pipe0 is not configured (PIPE0_API_KEY missing)." }, { status: 501 });
    }

    // Column fills only apply to firmographics (which extracts fields).
    const data: Prisma.EntityUncheckedUpdateInput = { status: "ENRICHED" };
    let payload: unknown;
    let storeKey: string = type;

    switch (type) {
      case "firmographics": {
        const enriched = await enrichDomain(domain);
        if (!enriched) {
          return NextResponse.json({ error: `No firmographics found for ${domain}.` }, { status: 404 });
        }
        payload = enriched.raw;
        const f = enriched.fields;
        if (f) {
          if (!entity.industry && f.industry) data.industry = f.industry;
          if (!entity.location && f.address) data.location = f.address;
          if (!entity.phone && f.phone) data.phone = f.phone;
          if (!entity.description && f.description) data.description = f.description;
          if (!entity.website && f.website) data.website = f.website;
        }
        break;
      }
      case "tech-stack":
        payload = await getCompanyTechStack(domain);
        storeKey = "techStack";
        break;
      case "funding":
        payload = await getCompanyFunding(domain);
        break;
      case "traffic":
        payload = await getCompanyTraffic(domain);
        storeKey = "websiteTraffic";
        break;
      case "overview":
        payload = await getCompanyOverview(domain);
        break;
      case "news":
        payload = await getCompanyNews(domain, entity.name);
        break;
    }

    if (isEmpty(payload)) {
      return NextResponse.json({ error: `No ${LABELS[type].toLowerCase()} found for ${domain}.` }, { status: 404 });
    }

    const existing =
      entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
        ? (entity.enrichment as Record<string, unknown>)
        : {};
    data.enrichment = { ...existing, [storeKey]: payload } as Prisma.InputJsonValue;

    const updated = await prisma.entity.update({ where: { id }, data });
    return NextResponse.json({ entity: updated, enriched: type });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities/[id]/enrich", e);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 502 });
  }
}
