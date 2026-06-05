import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { exaFindLinkedIn, isExaConfigured } from "@/lib/exa";
import { findWorkEmail, findMobile, isPipe0Configured } from "@/lib/pipe0";

type Field = "linkedin" | "email" | "phone";

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com",
]);

// Deep-search a provider response for the first plaintext string under a key
// matching one of `keys` (skipping hashed fields).
function pick(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 6 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const v of value) {
      const f = pick(v, keys, depth + 1);
      if (f) return f;
    }
    return undefined;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/hash/i.test(k)) continue;
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

function toDomain(c?: string | null): string | undefined {
  if (!c) return undefined;
  try {
    return new URL(c.startsWith("http") ? c : `https://${c}`).hostname.replace(/^www\./, "");
  } catch {
    if (/^[\w-]+\.[\w.-]+$/.test(c.trim())) return c.trim().toLowerCase().replace(/^www\./, "");
    return undefined;
  }
}

// Registrable domain (eTLD+1 approximation) for company-fit comparison.
function registrable(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

// True when two hosts belong to the same company domain (equal, subdomain, or
// same registrable domain). Used to FORCE company fit on emails.
function sameCompany(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase().replace(/^www\./, "");
  const y = b.toLowerCase().replace(/^www\./, "");
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`) || registrable(x) === registrable(y);
}

// POST /api/contacts/[id]/enrich  body: { field: "linkedin" | "email" | "phone" }
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
        return NextResponse.json({ error: "Exa is not configured (EXA_API_KEY missing)." }, { status: 501 });
      }
      if (!contact.name) {
        return NextResponse.json({ error: "Add a name first to find a LinkedIn profile." }, { status: 400 });
      }
      const url = await exaFindLinkedIn(contact.name, {
        company: contact.company ?? contact.entity?.name ?? undefined,
        title: contact.title ?? undefined,
        location: contact.location ?? undefined,
      });
      // Only accept an actual LinkedIn profile URL.
      value = url && /linkedin\.com\/(in|company)\//i.test(url) ? url : null;
    } else {
      if (!isPipe0Configured()) {
        return NextResponse.json({ error: "Pipe0 is not configured (PIPE0_API_KEY missing)." }, { status: 501 });
      }
      const { first, last } = splitName(contact.name);
      // The company domain must come from a STRONG source (the contact's own
      // website, their linked entity, or a corporate work-email domain). We never
      // guess it from a free-text company name - that risks the wrong company.
      const emailDomain = contact.email?.includes("@") ? contact.email.split("@")[1]?.toLowerCase() : undefined;
      const domain =
        toDomain(contact.website) ||
        toDomain(contact.entity?.website) ||
        toDomain(contact.entity?.domain) ||
        (emailDomain && !FREEMAIL.has(emailDomain) ? emailDomain : undefined);

      if (!first || !last) {
        return NextResponse.json({ error: "Add the contact's full name to enrich contact info." }, { status: 400 });
      }
      if (!domain) {
        return NextResponse.json(
          { error: "Link this contact to a company (or add a work email/website) first - we won't guess the company." },
          { status: 400 }
        );
      }

      const records = field === "email"
        ? await findWorkEmail(first, last, domain, contact.company ?? undefined)
        : await findMobile(first, last, domain, contact.company ?? undefined);

      if (field === "email") {
        const e = pick(records, ["email"]);
        // FORCE company fit: the email must be at the company's domain, else reject.
        value = e && e.includes("@") && sameCompany(e.split("@")[1], domain) ? e : null;
      } else {
        // Phone is gated on a verified company domain + name match above; Pipe0
        // resolves by name+domain so the number is company-scoped.
        value = pick(records, ["mobile", "phone", "number", "tel"]) ?? null;
      }
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
    return NextResponse.json({ error: "Enrichment failed - please try again." }, { status: 502 });
  }
}
