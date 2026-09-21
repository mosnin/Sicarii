import { NextRequest, NextResponse } from "next/server";
import { mailCapabilities, mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { listMailboxes, listDomains, listOrders } from "@/lib/mailbox-operations";

// GET /api/mail/status - everything the Mailboxes settings page needs in one
// round trip: deployment capabilities (which providers are configured), the
// account's domains, mailboxes and recent orders.
export async function GET(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    const [mailboxes, domains, orders] = await Promise.all([listMailboxes(user.id), listDomains(user.id), listOrders(user.id)]);
    return NextResponse.json({ capabilities: mailCapabilities(), mailboxes, domains, orders });
  } catch (e) {
    return mailError(e, "GET /api/mail/status");
  }
}
