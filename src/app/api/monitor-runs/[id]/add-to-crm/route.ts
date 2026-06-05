import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const MODEL = process.env.OPENAI_REFINER_MODEL ?? "gpt-5-mini";

// nullable() (not optional) for OpenAI strict structured outputs.
const schema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    domain: z.string().nullable(),
    website: z.string().nullable(),
    industry: z.string().nullable(),
    description: z.string().nullable(),
  })),
  contacts: z.array(z.object({
    name: z.string(),
    title: z.string().nullable(),
    email: z.string().nullable(),
    linkedin: z.string().nullable(),
    company: z.string().nullable(),
  })),
});

function host(input?: string | null): string | undefined {
  if (!input) return undefined;
  try { return new URL(input.startsWith("http") ? input : `https://${input}`).hostname.replace(/^www\./, ""); }
  catch { return undefined; }
}
const real = (s?: string | null) => Boolean(s && s.trim() && !["null", "unknown", "n/a", "none"].includes(s.trim().toLowerCase()));

// POST /api/monitor-runs/[id]/add-to-crm - the built-in agent reads the whole run
// report, extracts real companies + people with context, and adds them (deduped).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const rate = checkRateLimit(`run-add:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Needs OPENAI_API_KEY." }, { status: 501 });

    const run = await prisma.monitorRun.findUnique({ where: { id } });
    if (!run || run.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const items = Array.isArray(run.items) ? (run.items as { title?: string; url?: string; summary?: string }[]) : [];
    if (items.length === 0) return NextResponse.json({ error: "This run has no results to add." }, { status: 422 });

    const { object } = await generateObject({
      model: openai(MODEL),
      schema,
      prompt: `Extract real companies and named people (with context) from these intent-scan results. Drop directories/aggregators/listicles. Deduplicate. Use the company's own domain. Only include people who are actually named.

Results:
${items.map((i) => `- ${i.title ?? ""} (${i.url ?? ""}) ${i.summary ?? ""}`).join("\n").slice(0, 12000)}`,
    });

    // ── Create entities (dedup by domain) ──
    const nameToEntityId = new Map<string, string>();
    let entitiesAdded = 0;
    for (const e of object.entities) {
      if (!real(e.name)) continue;
      const domain = host(e.website) ?? (real(e.domain) ? e.domain!.toLowerCase().replace(/^www\./, "") : undefined);
      if (domain) {
        const existing = await prisma.entity.findFirst({ where: { userId: user.id, domain }, select: { id: true } });
        if (existing) { nameToEntityId.set(e.name.toLowerCase(), existing.id); continue; }
      }
      const created = await prisma.entity.create({
        data: {
          userId: user.id,
          name: e.name.trim(),
          domain,
          website: real(e.website) ? e.website : domain ? `https://${domain}` : null,
          industry: real(e.industry) ? e.industry : null,
          description: real(e.description) ? e.description : null,
          source: "radar",
          tags: ["intent"],
        },
      });
      nameToEntityId.set(e.name.toLowerCase(), created.id);
      entitiesAdded++;
    }

    // ── Create contacts (link to a matching entity by company name) ──
    let contactsAdded = 0;
    for (const c of object.contacts) {
      if (!real(c.name)) continue;
      const entityId = c.company ? nameToEntityId.get(c.company.toLowerCase()) : undefined;
      await prisma.contact.create({
        data: {
          userId: user.id,
          name: c.name.trim(),
          title: real(c.title) ? c.title : null,
          email: real(c.email) ? c.email : null,
          linkedin: real(c.linkedin) ? c.linkedin : null,
          company: real(c.company) ? c.company : null,
          entityId: entityId ?? null,
          source: "radar",
          tags: ["intent"],
        },
      });
      contactsAdded++;
    }

    await prisma.monitorRun.update({
      where: { id },
      data: { addedToCrm: true, added: run.added + entitiesAdded + contactsAdded },
    });

    return NextResponse.json({ ok: true, entitiesAdded, contactsAdded });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/monitor-runs/[id]/add-to-crm", e);
    return NextResponse.json({ error: "Add to CRM failed" }, { status: 502 });
  }
}
