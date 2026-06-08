import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

const MODEL = process.env.OPENAI_REFINER_MODEL ?? "gpt-5-mini";

const schema = z.object({
  kind: z.enum(["contact", "entity"]),
  query: z.string().trim().min(1).max(300),
  items: z.array(z.object({ id: z.string(), text: z.string() })).min(1).max(120),
});

// POST /api/crm/semantic-sort - rank records by how well they match a natural
// language intent (patterns, fit), using a small fast model. Returns ordered ids.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`semantic-sort:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Smart sort needs OPENAI_API_KEY." }, { status: 501 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const { kind, query, items } = parsed.data;

    const { object } = await generateObject({
      model: openai(MODEL),
      schema: z.object({ orderedIds: z.array(z.string()) }),
      prompt: `Rank these CRM ${kind} records by how well they match this intent, best first:
"${query}"

Judge on patterns and fit (role, industry, signals, recency cues in the text), not just keyword overlap. Return orderedIds containing ONLY ids from the list below, best matches first, and omit clearly irrelevant ones.

Records (id :: text):
${items.map((i) => `${i.id} :: ${i.text}`).join("\n").slice(0, 12000)}`,
    });

    // Keep only valid ids, preserve model order, append any the model dropped.
    const valid = new Set(items.map((i) => i.id));
    const seen = new Set<string>();
    const ordered = object.orderedIds.filter((id) => valid.has(id) && !seen.has(id) && seen.add(id));
    const missing = items.map((i) => i.id).filter((id) => !seen.has(id));

    return NextResponse.json({ orderedIds: [...ordered, ...missing] });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/crm/semantic-sort", e);
    return NextResponse.json({ error: "Smart sort failed" }, { status: 500 });
  }
}
