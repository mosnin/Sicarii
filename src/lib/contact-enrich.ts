// Per-field contact enrichment (LinkedIn / work email / phone), shared by the
// REST route and the MCP `enrich_contact` tool so both behave identically.
//
// HARD ACCURACY RULE: never attach data for a same-name stranger or the wrong
// company. The company domain must come from a STRONG source (the contact's own
// website, their linked entity, or a corporate work-email domain) - never
// guessed from a free-text company name. Found emails must be at the company
// domain; people-directory matches require first AND last name to match. Prefer
// returning nothing over a wrong value.

import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";
import { exaFindLinkedIn, isExaConfigured } from "@/lib/exa";
import { findWorkEmail, findMobile, isPipe0Configured } from "@/lib/pipe0";
import { getPeopleAtCompany, isExploriumConfigured } from "@/lib/explorium";

export type Field = "linkedin" | "email" | "phone";

export interface EnrichContactResult {
  contact: unknown;
  via?: string;
  value?: string;
  message?: string;
}

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com",
]);

// A single, well-formed address (exactly one @, a dotted domain).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (s?: string | null): s is string => Boolean(s) && EMAIL_RE.test(s!.trim());

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

// Strict person-identity match: we only accept an Explorium prospect whose first
// AND last name match the contact we're enriching.
function nameMatches(
  p: { first_name?: string; last_name?: string; full_name?: string },
  first: string,
  last: string,
): boolean {
  const f = first.toLowerCase();
  const l = last.toLowerCase();
  const pf = (p.first_name ?? "").toLowerCase();
  const pl = (p.last_name ?? "").toLowerCase();
  if (pf && pl) return pf === f && pl === l;
  const full = (p.full_name ?? "").toLowerCase();
  return Boolean(full) && full.includes(f) && full.includes(l);
}

// Fallback finder: pull the people at the company domain and return the one who
// is verifiably this same person (name match), or null.
async function exploriumPerson(domain: string, first: string, last: string) {
  const people = await getPeopleAtCompany(domain, { limit: 25, hasEmail: false });
  return people.find((p) => nameMatches(p, first, last)) ?? null;
}

// Deep-search a provider response for a string value containing `needle`
// (case-insensitive). Used to confirm a phone result is actually about this
// person (the response body mentions their surname) before trusting it.
function deepIncludes(value: unknown, needle: string, depth = 0): boolean {
  if (depth > 6 || value == null || !needle) return false;
  const n = needle.toLowerCase();
  if (typeof value === "string") return value.toLowerCase().includes(n);
  if (Array.isArray(value)) return value.some((v) => deepIncludes(v, needle, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) => deepIncludes(v, needle, depth + 1));
  }
  return false;
}

/**
 * Find and save one missing field on a contact. Throws OpError (with an HTTP
 * status) on the various "can't proceed" cases so REST and MCP map identically.
 */
export async function enrichContactField(
  userId: string,
  contactId: string,
  field: Field,
): Promise<EnrichContactResult> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { entity: { select: { domain: true, website: true, name: true } } },
  });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  if (contact[field]) return { contact, message: `${field} already set.` };

  let value: string | null = null;
  let via: string | undefined;

  if (field === "linkedin") {
    const { first, last } = splitName(contact.name);
    const linkedinDomain =
      toDomain(contact.website) || toDomain(contact.entity?.website) || toDomain(contact.entity?.domain);

    if (!isExaConfigured() && !isExploriumConfigured())
      throw new OpError("No LinkedIn finder configured (set EXA_API_KEY or EXPLORIUM_API_KEY).", 501);
    if (!contact.name)
      throw new OpError("Add a name first to find a LinkedIn profile.", 400);

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
    if (!value && isExploriumConfigured() && first && last && linkedinDomain) {
      try {
        const person = await exploriumPerson(linkedinDomain, first, last);
        if (person?.linkedin && /linkedin\.com\/(in|company)\//i.test(person.linkedin)) { value = person.linkedin; via = "explorium"; }
      } catch (e) { console.warn("[enrich] explorium linkedin failed", e); }
    }
  } else {
    if (!isPipe0Configured() && !isExploriumConfigured())
      throw new OpError("No contact-info finder configured (set PIPE0_API_KEY or EXPLORIUM_API_KEY).", 501);

    const { first, last } = splitName(contact.name);
    // The company domain must come from a STRONG source - never guessed from a
    // free-text company name.
    const emailDomain = contact.email?.includes("@") ? contact.email.split("@")[1]?.toLowerCase() : undefined;
    const domain =
      toDomain(contact.website) ||
      toDomain(contact.entity?.website) ||
      toDomain(contact.entity?.domain) ||
      (emailDomain && !FREEMAIL.has(emailDomain) ? emailDomain : undefined);

    if (!first || !last)
      throw new OpError("Add the contact's full name to enrich contact info.", 400);
    if (!domain)
      throw new OpError("Link this contact to a company (or add a work email/website) first - we won't guess the company.", 400);

    if (field === "email") {
      if (isPipe0Configured()) {
        try {
          const e = pick(await findWorkEmail(first, last, domain, contact.company ?? undefined), ["email"]);
          if (isEmail(e) && sameCompany(e.split("@")[1], domain)) { value = e; via = "pipe0"; }
        } catch (e) { console.warn("[enrich] pipe0 email failed", e); }
      }
      if (!value && isExploriumConfigured()) {
        try {
          const person = await exploriumPerson(domain, first, last);
          const e = person?.email;
          if (isEmail(e) && sameCompany(e.split("@")[1], domain)) { value = e; via = "explorium"; }
        } catch (e) { console.warn("[enrich] explorium email failed", e); }
      }
    } else {
      // Phone: company-scoped to this exact person. Pipe0, then Explorium.
      if (isPipe0Configured()) {
        try {
          const resp = await findMobile(first, last, domain, contact.company ?? undefined);
          const p = pick(resp, ["mobile", "phone", "number", "tel"]);
          // ACCURACY RULE: a phone has no domain to anchor it, so only accept it
          // when the provider's response actually concerns THIS person (its body
          // echoes the surname). Otherwise we'd risk a switchboard or a different
          // record's number - prefer null over a wrong phone.
          if (p && deepIncludes(resp, last)) { value = p; via = "pipe0"; }
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

  if (!value) throw new OpError(`Couldn't find a ${field} for this contact.`, 404);

  const updated = await prisma.contact.update({
    where: { id: contactId },
    data: {
      [field]: value,
      ...(contact.status === "NEW" ? { status: "ENRICHED" } : {}),
    },
  });

  return { contact: updated, via, value };
}
