import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { decideTurn } from "@/lib/jev";

const schema = z.object({
  message: z.string().trim().min(1).max(4000),
  priorAssistant: z.string().trim().max(4000).optional(),
  tools: z.record(z.string(), z.string().max(200)).optional(),
  skills: z.record(z.string(), z.string().max(200)).optional(),
});

function clampCatalog(map?: Record<string, string>, max = 40): Record<string, string> | undefined {
  if (!map) return undefined;
  const entries = Object.entries(map).slice(0, max);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`jev-decide:${user.id}`, 40, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Say what you want to do." }, { status: 400 });

    const decision = await decideTurn({
      message: parsed.data.message,
      priorAssistant: parsed.data.priorAssistant,
      tools: clampCatalog(parsed.data.tools),
      skills: clampCatalog(parsed.data.skills),
    });
    return NextResponse.json(decision);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/jev/decide", e);
    return NextResponse.json({ error: "Jev decide failed." }, { status: 500 });
  }
}
