import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { generateVoiceInboundSecret } from "@/lib/agentphone";

// GET /api/settings/voice - the current voice-native-CRM config for the
// signed-in user (enabled flag, whether AgentPhone is connected, and the
// per-user secret used to build the inbound webhook URL shown in Settings).
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    return NextResponse.json({
      enabled: user.voiceEnabled,
      connected: Boolean(user.agentPhoneApiKey),
      secret: user.voiceInboundSecret ?? null,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/settings/voice", e);
    return NextResponse.json({ error: "Failed to load voice settings" }, { status: 500 });
  }
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  rotate: z.boolean().optional(),
});

// voiceInboundSecret has no DB-level unique constraint (see the schema
// comment on that column: a UNIQUE INDEX on this Supabase project's `users`
// table fails `prisma db push`, confirmed by deploy behavior across sibling
// PRs). It is unique BY CONSTRUCTION instead: 256 random bits means a
// collision against any existing row is astronomically unlikely (on the
// order of 1 in 2^128 for the birthday bound at any realistic user count),
// but "astronomically unlikely" is not "impossible", so this generates a
// candidate and checks it against every existing secret before accepting it,
// regenerating on the (never-expected-to-happen) hit. This is the whole
// uniqueness guarantee now that the DB is not enforcing it, so it must run
// on every mint, not just be a comment.
const MAX_SECRET_ATTEMPTS = 5;
async function generateUniqueVoiceInboundSecret(): Promise<string> {
  for (let attempt = 0; attempt < MAX_SECRET_ATTEMPTS; attempt++) {
    const candidate = generateVoiceInboundSecret();
    const collision = await prisma.user.findFirst({
      where: { voiceInboundSecret: candidate },
      select: { id: true },
    });
    if (!collision) return candidate;
    console.warn("[settings/voice] voiceInboundSecret collision on generation, regenerating");
  }
  // Reaching this in practice would mean something is wrong with the RNG
  // itself, not bad luck - fail loudly rather than silently accept a
  // colliding secret.
  throw new Error("Could not generate a unique voice inbound secret");
}

// PATCH /api/settings/voice - enable/disable voice and/or rotate the inbound
// secret. Enabling requires a connected AgentPhone key: voice with no
// AgentPhone account behind it is a dead end, so we refuse rather than let
// the UI show a webhook URL that can never receive a real call.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (parsed.data.enabled === undefined && parsed.data.rotate === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (parsed.data.enabled === true && !user.agentPhoneApiKey) {
      return NextResponse.json(
        { error: "Connect your AgentPhone account first, then enable voice." },
        { status: 400 },
      );
    }

    const data: { voiceEnabled?: boolean; voiceInboundSecret?: string } = {};
    if (parsed.data.enabled !== undefined) data.voiceEnabled = parsed.data.enabled;
    // Mint a secret the first time voice is turned on, or whenever the
    // operator explicitly asks to rotate (invalidates the old webhook URL).
    if (parsed.data.rotate || (parsed.data.enabled === true && !user.voiceInboundSecret)) {
      data.voiceInboundSecret = await generateUniqueVoiceInboundSecret();
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });

    return NextResponse.json({
      enabled: updated.voiceEnabled,
      connected: Boolean(updated.agentPhoneApiKey),
      secret: updated.voiceInboundSecret ?? null,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("PATCH /api/settings/voice", e);
    return NextResponse.json({ error: "Failed to save voice settings" }, { status: 500 });
  }
}
