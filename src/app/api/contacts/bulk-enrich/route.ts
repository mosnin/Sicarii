import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { exaFindLinkedIn, isExaConfigured } from "@/lib/exa";
import { findWorkEmail, findMobile, isPipe0Configured } from "@/lib/pipe0";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(25) });

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com",
]);

function pick(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 6 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const v of value) { const f = pick(v, keys, depth + 1); if (f) return f; }
    return undefined;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/hash/i.test(k)) continue;
      if (typeof v === "string" && v.trim() && keys.some((key) => k.toLowerCase().includes(key))) return v.trim();
    }
    for (const v of Object.values(value as Record<string, unknown>)) { const f = pick(v, keys, depth + 1); if (f) return f; }
  }
  return undefined;
}

function toDomain(c?: string | null): string | undefined {
  if (!c) return undefined;
  try { return new URL(c.startsWith("http") ? c : `https://${c}`).hostname.replace(/^www\./, ""); }
  catch { return /^[\w-]+\.[\w.-]+$/.test(c.trim()) ? c.trim().toLowerCase().replace(/^www\./, "") : undefined; }
}

function registrable(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}
// FORCE company fit: emails must belong to the company's domain.
function sameCompany(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase().replace(/^www\./, "");
  const y = b.toLowerCase().replace(/^www\./, "");
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`) || registrable(x) === registrable(y);
}

// POST /api/contacts/bulk-enrich - fill missing linkedin/email/phone for many
// contacts at once. Sequential + capped.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`contacts:bulk-enrich:${user.id}`, 5, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Provide ids: string[]" }, { status: 400 });

    const contacts = await prisma.contact.findMany({
      where: { userId: user.id, id: { in: parsed.data.ids } },
      include: { entity: { select: { domain: true, website: true, name: true } } },
    });

    const exaOn = isExaConfigured();
    const pipe0On = isPipe0Configured();

    let enriched = 0;
    let fieldsFilled = 0;
    for (const c of contacts) {
      const update: Record<string, string> = {};
      const parts = (c.name ?? "").trim().split(/\s+/).filter(Boolean);
      const first = parts[0];
      const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
      const emailDomain = c.email?.includes("@") ? c.email.split("@")[1]?.toLowerCase() : undefined;
      // Strong-source company domain only (no guessing from a company name).
      const domain =
        toDomain(c.website) || toDomain(c.entity?.website) || toDomain(c.entity?.domain) ||
        (emailDomain && !FREEMAIL.has(emailDomain) ? emailDomain : undefined);

      try {
        if (!c.linkedin && exaOn && c.name) {
          const url = await exaFindLinkedIn(c.name, {
            company: c.company ?? c.entity?.name ?? undefined,
            title: c.title ?? undefined,
            location: c.location ?? undefined,
          });
          if (url && /linkedin\.com\/(in|company)\//i.test(url)) update.linkedin = url;
        }
        if (!c.email && pipe0On && first && last && domain) {
          const e = pick(await findWorkEmail(first, last, domain, c.company ?? undefined), ["email"]);
          // FORCE company fit: only accept an email at the company's domain.
          if (e && e.includes("@") && sameCompany(e.split("@")[1], domain)) update.email = e;
        }
        if (!c.phone && pipe0On && first && last && domain) {
          const p = pick(await findMobile(first, last, domain, c.company ?? undefined), ["mobile", "phone", "number"]);
          if (p) update.phone = p;
        }
      } catch (e) {
        console.error(`[bulk-enrich] contact ${c.id} failed`, e);
      }

      const keys = Object.keys(update);
      if (keys.length > 0) {
        await prisma.contact.update({
          where: { id: c.id },
          data: { ...update, ...(c.status === "NEW" ? { status: "ENRICHED" } : {}) },
        });
        enriched++;
        fieldsFilled += keys.length;
      }
    }

    return NextResponse.json({ enriched, fieldsFilled, total: contacts.length });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/contacts/bulk-enrich", e);
    return NextResponse.json({ error: "Bulk enrichment failed" }, { status: 500 });
  }
}
