import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { exaFindLinkedIn, isExaConfigured } from "@/lib/exa";
import { findWorkEmail, findMobile, isPipe0Configured } from "@/lib/pipe0";
import { getPeopleAtCompany, isExploriumConfigured } from "@/lib/explorium";

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

// Strict person-identity match. Enrichment must NEVER attach a same-company
// stranger's contact info: we only accept an Explorium prospect whose first AND
// last name match the contact we're enriching.
function nameMatches(p: { first_name?: string; last_name?: string; full_name?: string }, first: string, last: string): boolean {
  const f = first.toLowerCase();
  const l = last.toLowerCase();
  const pf = (p.first_name ?? "").toLowerCase();
  const pl = (p.last_name ?? "").toLowerCase();
  if (pf && pl) return pf === f && pl === l;
  const full = (p.full_name ?? "").toLowerCase();
  return Boolean(full) && full.includes(f) && full.includes(l);
}

// Fallback finder: pull the people at the company domain and return the one who
// is verifiably this same person (name match), or null. Used when the primary
// tool comes up empty, so a single failed provider isn't the end of the road.
async function exploriumPerson(domain: string, first: string, last: string) {
  const people = await getPeopleAtCompany(domain, { limit: 25, hasEmail: false });
  return people.find((p) => nameMatches(p, first, last)) ?? null;
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
    // Which provider actually filled the field (handy for debugging/telemetry).
    let via: string | undefined;

    if (field === "linkedin") {
      const { first, last } = splitName(contact.name);
      const linkedinDomain =
        toDomain(contact.website) || toDomain(contact.entity?.website) || toDomain(contact.entity?.domain);

      if (!isExaConfigured() && !isExploriumConfigured()) {
        return NextResponse.json({ error: "No LinkedIn finder configured (set EXA_API_KEY or EXPLORIUM_API_KEY)." }, { status: 501 });
      }
      if (!contact.name) {
        return NextResponse.json({ error: "Add a name first to find a LinkedIn profile." }, { status: 400 });
      }

      // 1) Exa search by name + company/title.
      if (isExaConfigured()) {
        try {
          const url = await exaFindLinkedIn(contact.name, {
            company: contact.company ?? contact.entity?.name ?? undefined,
            title: contact.title ?? undefined,
            location: contact.location ?? undefined,
          });
          if (url && /linkedin\.com\/(in|company)\//i.test(url)) { value = url; via = "exa"; }
        } catch (e) { console.warn("[enrich] exa linkedin failed", e); }
      }
      // 2) Fallback: the company's people directory, matched to this exact person.
      if (!value && isExploriumConfigured() && first && last && linkedinDomain) {
        try {
          const person = await exploriumPerson(linkedinDomain, first, last);
          if (person?.linkedin && /linkedin\.com\/(in|company)\//i.test(person.linkedin)) { value = person.linkedin; via = "explorium"; }
        } catch (e) { console.warn("[enrich] explorium linkedin failed", e); }
      }
    } else {
      if (!isPipe0Configured() && !isExploriumConfigured()) {
        return NextResponse.json({ error: "No contact-info finder configured (set PIPE0_API_KEY or EXPLORIUM_API_KEY)." }, { status: 501 });
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

      if (field === "email") {
        // 1) Pipe0, then 2) Explorium - each forced to company-fit before accepting.
        if (isPipe0Configured()) {
          try {
            const e = pick(await findWorkEmail(first, last, domain, contact.company ?? undefined), ["email"]);
            if (e && e.includes("@") && sameCompany(e.split("@")[1], domain)) { value = e; via = "pipe0"; }
          } catch (e) { console.warn("[enrich] pipe0 email failed", e); }
        }
        if (!value && isExploriumConfigured()) {
          try {
            const person = await exploriumPerson(domain, first, last);
            const e = person?.email;
            if (e && e.includes("@") && sameCompany(e.split("@")[1], domain)) { value = e; via = "explorium"; }
          } catch (e) { console.warn("[enrich] explorium email failed", e); }
        }
      } else {
        // Phone: gated on verified company domain + name match, so the number is
        // company-scoped to this exact person. 1) Pipe0, then 2) Explorium.
        if (isPipe0Configured()) {
          try {
            const p = pick(await findMobile(first, last, domain, contact.company ?? undefined), ["mobile", "phone", "number", "tel"]);
            if (p) { value = p; via = "pipe0"; }
          } catch (e) { console.warn("[enrich] pipe0 phone failed", e); }
        }
        if (!value && isExploriumConfigured()) {
          try {
            const person = await exploriumPerson(domain, first, last);
            if (person?.phone) { value = person.phone; via = "explorium"; }
          } catch (e) { console.warn("[enrich] explorium phone failed", e); }
        }
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

    return NextResponse.json({ contact: updated, via });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/contacts/[id]/enrich", e);
    return NextResponse.json({ error: "Enrichment failed - please try again." }, { status: 502 });
  }
}
