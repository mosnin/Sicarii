import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { encryptSecret, decryptSecret } from "@/lib/secrets";

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
  autoRadar: z.boolean().optional(),
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
      autoRadar?: boolean;
    } = {};
    if (parsed.data.productContext !== undefined) {
      data.productContext = parsed.data.productContext;
    }
    // Track the plaintext last4 here (before encrypting) so the response can
    // show it without a decrypt round trip. Encrypted at rest; see
    // src/lib/secrets.ts. Empty string clears the key.
    let agentMailKeyLast4: string | null | undefined;
    let agentPhoneKeyLast4: string | null | undefined;
    if (parsed.data.agentMailApiKey !== undefined) {
      const next = parsed.data.agentMailApiKey || null;
      data.agentMailApiKey = next ? encryptSecret(next) : null;
      agentMailKeyLast4 = next ? next.slice(-4) : null;
    }
    if (parsed.data.agentPhoneApiKey !== undefined) {
      const next = parsed.data.agentPhoneApiKey || null;
      data.agentPhoneApiKey = next ? encryptSecret(next) : null;
      agentPhoneKeyLast4 = next ? next.slice(-4) : null;
    }
    if (parsed.data.taskWebhookUrl !== undefined) {
      data.taskWebhookUrl = parsed.data.taskWebhookUrl || null;
    }
    if (parsed.data.autoRadar !== undefined) {
      data.autoRadar = parsed.data.autoRadar;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });

    // The autoRadar switch is a REAL off switch: flipping it pauses/resumes the
    // ICP radar that was auto-seeded for this user (scoped to their own rows).
    if (parsed.data.autoRadar !== undefined) {
      await prisma.intentMonitor.updateMany({
        where: { userId: user.id, autoSeeded: true },
        data: { active: parsed.data.autoRadar },
      });
    }

    // When this request didn't touch a key, fall back to decrypting the
    // stored value for the last4 display (decryptSecret is tolerant of
    // legacy plaintext - see src/lib/secrets.ts).
    if (agentMailKeyLast4 === undefined) {
      agentMailKeyLast4 = updated.agentMailApiKey
        ? decryptSecret(updated.agentMailApiKey).slice(-4)
        : null;
    }
    if (agentPhoneKeyLast4 === undefined) {
      agentPhoneKeyLast4 = updated.agentPhoneApiKey
        ? decryptSecret(updated.agentPhoneApiKey).slice(-4)
        : null;
    }

    return NextResponse.json({
      ok: true,
      productContext: updated.productContext ?? "",
      agentMailKeyLast4,
      agentPhoneKeyLast4,
      taskWebhookUrl: updated.taskWebhookUrl ?? "",
      autoRadar: updated.autoRadar,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("PATCH /api/settings", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
