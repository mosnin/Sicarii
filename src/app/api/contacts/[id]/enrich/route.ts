import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { exaFindLinkedIn, isExaConfigured } from "@/lib/exa";
import { findWorkEmail, findMobile, isPipe0Configured } from "@/lib/pipe0";

type Field = "linkedin" | "email" | "phone";

// Deep-search a provider response object for the first string under a matching key.
function pick(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 5 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const v of value) {
      const f = pick(v, keys, depth + 1);
      if (f) return f;
    }
    return undefined;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() && keys.some((key) => k.toLowerCase().includes(key))) {
        return v.trim();
      }
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
      const f = pick(v, keys, depth + 1);
      if (f) return f;
    }
  }
  return undefined;
}

function splitName(name?: string | null): { first?: string; last?: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function domainFrom(...candidates: (string | null | undefined)[]): string | undefined {
  for (const c of candidates) {
    if (!c) continue;
    try {
      return new URL(c.startsWith("http") ? c : `https://${c}`).hostname.replace(/^www\./, "");
    } catch {
      if (/^[\w-]+\.[\w.-]+$/.test(c.trim())) return c.trim().toLowerCase().replace(/^www\./, "");
    }
  }
  return undefined;
}

// POST /api/contacts/[id]/enrich  body: { field: "linkedin" | "email" | "phone" }
// Fills a single missing field using the most appropriate provider. Returns the
// updated contact. No-ops (with a message) if the field is already populated.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = checkRateLimit(`contact-enrich:${user.id}`, 30, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as { field?: Field } | null;
    const field = body?.field;
    if (!field || !["linkedin", "email", "phone"].includes(field)) {
      return NextResponse.json({ error: "field must be linkedin, email, or phone" }, { status: 400 });
    }

    const contact = await prisma.contact.findUnique({
      where: { id },
      include: { entity: { select: { domain: true, website: true, name: true } } },
    });
    if (!contact || contact.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (contact[field]) {
      return NextResponse.json({ contact, message: `${field} already set.` });
    }

    let value: string | null = null;

    if (field === "linkedin") {
      if (!isExaConfigured()) {
        return NextResponse.json({ error: "Exa is not configured." }, { status: 501 });
      }
      if (!contact.name) {
        return NextResponse.json({ error: "Contact needs a name to find a LinkedIn profile." }, { status: 400 });
      }
      value = await exaFindLinkedIn(contact.name, contact.company ?? contact.entity?.name ?? undefined);
    } else {
      // email / phone via Pipe0
      if (!isPipe0Configured()) {
        return NextResponse.json({ error: "Pipe0 is not configured." }, { status: 501 });
      }
      const { first, last } = splitName(contact.name);
      const domain = domainFrom(contact.website, contact.entity?.website, contact.entity?.domain, contact.company);
      if (!first || !last || !domain) {
        return NextResponse.json(
          { error: "Need the contact's full name and a company domain to enrich contact info." },
          { status: 400 }
        );
      }
      const records = field === "email"
        ? await findWorkEmail(first, last, domain, contact.company ?? undefined)
        : await findMobile(first, last, domain, contact.company ?? undefined);
      value = field === "email"
        ? pick(records, ["email"]) ?? null
        : pick(records, ["mobile", "phone", "number"]) ?? null;
    }

    if (!value) {
      return NextResponse.json({ error: `Couldn't find a ${field} for this contact.` }, { status: 404 });
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        [field]: value,
        ...(contact.status === "NEW" ? { status: "ENRICHED" } : {}),
      },
    });

    return NextResponse.json({ contact: updated });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/contacts/[id]/enrich", e);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
