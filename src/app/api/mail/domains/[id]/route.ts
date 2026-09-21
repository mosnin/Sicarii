import { NextRequest, NextResponse } from "next/server";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { deleteDomain } from "@/lib/mailbox-operations";

// DELETE /api/mail/domains/[id] - drop a domain that has no mailboxes left.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMailUser(req);
    const { id } = await params;
    return NextResponse.json(await deleteDomain(user.id, id));
  } catch (e) {
    return mailError(e, "DELETE /api/mail/domains/[id]");
  }
}
