import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  OpError,
  saveSocialMessage,
  listSocialMessages,
  type SocialChannelName,
} from "@/lib/crm-operations";

const CHANNELS = ["LINKEDIN", "X", "INSTAGRAM", "FACEBOOK", "OTHER"] as const;

const createSchema = z.object({
  channel: z.enum(CHANNELS),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  body: z.string().trim().min(1).max(10000),
  threadRef: z.string().trim().max(500).optional(),
  sentAt: z.string().datetime().optional(),
});

// GET /api/contacts/[id]/social-messages - the social conversation history.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const channelParam = new URL(req.url).searchParams.get("channel");
    const channel = (CHANNELS as readonly string[]).includes(channelParam ?? "")
      ? (channelParam as SocialChannelName)
      : undefined;
    const messages = await listSocialMessages(user.id, id, channel);
    return NextResponse.json({ messages });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/contacts/[id]/social-messages", e);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

// POST /api/contacts/[id]/social-messages - log a social message on the contact.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const json = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid message", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const message = await saveSocialMessage(user.id, {
      contactId: id,
      channel: parsed.data.channel,
      direction: parsed.data.direction,
      body: parsed.data.body,
      threadRef: parsed.data.threadRef ?? null,
      sentAt: parsed.data.sentAt ? new Date(parsed.data.sentAt) : null,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/contacts/[id]/social-messages", e);
    return NextResponse.json({ error: "Failed to log message" }, { status: 500 });
  }
}
