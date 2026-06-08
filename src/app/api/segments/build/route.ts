import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildSegmentMatches } from "@/lib/segment-build";

export const maxDuration = 60;

const schema = z.object({
  goal: z.string().trim().min(3).max(2000),
  quantity: z.number().int().min(1).max(100).optional(),
  name: z.string().trim().max(120).optional(),
});

// POST /api/segments/build - build a segment from a prompt. Vector-matches the
// closest ELIGIBLE prospects (enriched + not yet contacted + not in a pipeline).
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`segment-build:${user.id}`, 8, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Segment building needs OPENAI_API_KEY." }, { status: 501 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Describe the segment goal." }, { status: 400 });
    const { goal, quantity = 20, name } = parsed.data;

    const { matches, eligibleCount } = await buildSegmentMatches(user.id, goal, quantity);

    if (eligibleCount === 0) {
      return NextResponse.json(
        { error: "No eligible prospects yet. Segments only target enriched leads that haven't been contacted." },
        { status: 422 }
      );
    }
    if (matches.length === 0) {
      return NextResponse.json({ error: "Couldn't match any prospects to that goal." }, { status: 422 });
    }

    const segment = await prisma.segment.create({
      data: { userId: user.id, name: name || goal.slice(0, 80), goal, source: "prompt" },
    });
    await prisma.contactSegment.createMany({
      data: matches.map((m) => ({ segmentId: segment.id, contactId: m.contactId, score: m.score })),
      skipDuplicates: true,
    });

    return NextResponse.json({ segment, matched: matches.length, eligible: eligibleCount });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/segments/build", e);
    return NextResponse.json({ error: "Segment build failed" }, { status: 500 });
  }
}
