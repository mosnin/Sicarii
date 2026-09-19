import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { exaFindCompanies, isExaConfigured, isMeaningful } from "@/lib/exa";
import { geocodeCached, reverseGeocode } from "@/lib/geocode";
import { createEntity, dedupeAgainstCrm, OpError } from "@/lib/crm-operations";
import { filterRealCompanies } from "@/lib/jev";

export const maxDuration = 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const schema = z.object({
  query: z.string().trim().min(2).max(300),
  place: z.string().trim().max(120).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  quantity: z.number().int().min(1).max(20).optional(),
});

// POST /api/entities/find-here - Exa deep-researches companies for the query in
// the given place, adds new ones (deduped), and geocodes them so they appear on
// the map.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`find-here:${user.id}`, 6, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isExaConfigured()) return NextResponse.json({ error: "EXA_API_KEY is not configured." }, { status: 501 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Describe what to find." }, { status: 400 });
    const { query, quantity = 10, lat, lng } = parsed.data;
    const place = parsed.data.place ?? (lat != null && lng != null ? await reverseGeocode(lat, lng) ?? undefined : undefined);

    const prompt = place ? `${query} in ${place}` : query;
    const companies = (await exaFindCompanies(prompt, quantity)).filter((c) => isMeaningful(c.companyName));
    const { fresh } = await dedupeAgainstCrm(user.id, companies);
    const realRows = fresh.map((c, i) => ({
      id: c.domain ?? `${i}:${c.companyName.trim().toLowerCase()}`,
      text: [c.companyName, c.domain, c.website, c.industry, c.description].filter(Boolean).join(" "),
    }));
    const realKeep = await filterRealCompanies(realRows);
    const toAdd = fresh.filter((_, i) => !realKeep || realKeep.has(realRows[i]!.id));

    let added = 0;
    const points: { id: string; name: string; lat: number; lng: number }[] = [];
    for (const c of toAdd) {
      const address = c.address ?? place;
      let coords = null as { lat: number; lng: number } | null;
      if (address) {
        const { result: g, cached } = await geocodeCached(address);
        if (g) coords = { lat: g.lat, lng: g.lng };
        if (!cached) await sleep(1100);
      }

      try {
        const entity = await createEntity(user.id, {
          name: c.companyName,
          domain: c.domain ?? null,
          website: c.website ?? null,
          industry: c.industry ?? null,
          location: address ?? null,
          phone: c.phone ?? null,
          description: c.description ?? null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          geocodedAt: coords ? new Date() : null,
          source: "map",
          tags: ["map"],
        });
        added++;
        if (coords) points.push({ id: entity.id, name: entity.name, lat: coords.lat, lng: coords.lng });
      } catch (err) {
        if (err instanceof OpError) continue;
        throw err;
      }
    }

    return NextResponse.json({ added, points });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities/find-here", e);
    return NextResponse.json({ error: "Find here failed" }, { status: 502 });
  }
}
