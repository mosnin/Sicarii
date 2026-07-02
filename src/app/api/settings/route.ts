import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

const patchSchema = z.object({
  productContext: z.string().max(20000).optional(),
  agentMailApiKey: z.string().trim().max(300).optional(),
  agentPhoneApiKey: z.string().trim().max(300).optional(),
  taskWebhookUrl: z
    .string()
    .trim()
    .max(500)
    // HTTPS only: the outbound webhook sender (safeHttpUrl) rejects http, so
    // accepting it here would silently save a URL that never fires. Match the
    // send-time guard and fail fast with a clear message instead.
    .refine((v) => v === "" || /^https:\/\/.+/i.test(v), "Must be an https:// URL")
    .optional(),
});

// PATCH /api/settings - update the current user's per-user settings
// (productContext = what you're selling; agentMailApiKey = connected email key).
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid settings", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: {
      productContext?: string;
      agentMailApiKey?: string | null;
      agentPhoneApiKey?: string | null;
      taskWebhookUrl?: string | null;
    } = {};
    if (parsed.data.productContext !== undefined) {
      data.productContext = parsed.data.productContext;
    }
    if (parsed.data.agentMailApiKey !== undefined) {
      // Empty string clears the key.
      data.agentMailApiKey = parsed.data.agentMailApiKey || null;
    }
    if (parsed.data.agentPhoneApiKey !== undefined) {
      data.agentPhoneApiKey = parsed.data.agentPhoneApiKey || null;
    }
    if (parsed.data.taskWebhookUrl !== undefined) {
      data.taskWebhookUrl = parsed.data.taskWebhookUrl || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });

    return NextResponse.json({
      ok: true,
      productContext: updated.productContext ?? "",
      agentMailKeyLast4: updated.agentMailApiKey ? updated.agentMailApiKey.slice(-4) : null,
      agentPhoneKeyLast4: updated.agentPhoneApiKey ? updated.agentPhoneApiKey.slice(-4) : null,
      taskWebhookUrl: updated.taskWebhookUrl ?? "",
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("PATCH /api/settings", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
