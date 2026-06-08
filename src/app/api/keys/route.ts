import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { generateApiKey } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";

const select = {
  id: true,
  name: true,
  prefix: true,
  last4: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

// GET /api/keys - list the user's API keys (never returns the secret).
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select,
    });
    return NextResponse.json({ keys });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/keys", e);
    return NextResponse.json({ error: "Failed to list keys" }, { status: 500 });
  }
}

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });

// POST /api/keys - mint a key. The plaintext is returned exactly once.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = checkRateLimit(`keys:create:${user.id}`, 10, 60 * 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many keys created. Try again later." }, { status: 429 });
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "A name is required" }, { status: 400 });
    }
    const { plaintext, hashedKey, prefix, last4 } = generateApiKey();
    const key = await prisma.apiKey.create({
      data: { userId: user.id, name: parsed.data.name, hashedKey, prefix, last4 },
      select,
    });
    // `plaintext` is shown once and never persisted.
    return NextResponse.json({ key, plaintext }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/keys", e);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
