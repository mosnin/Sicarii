import { NextRequest, NextResponse } from "next/server";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { getThread } from "@/lib/mailbox-operations";

// GET /api/mail/messages/[id]/thread - the whole conversation a message
// belongs to, oldest first (threaded on Message-ID / In-Reply-To).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMailUser(req);
    const { id } = await params;
    return NextResponse.json({ messages: await getThread(user.id, id) });
  } catch (e) {
    return mailError(e, "GET /api/mail/messages/[id]/thread");
  }
}
