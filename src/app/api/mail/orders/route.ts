import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { appOrigin, mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { createDomainOrder, createInboxOrder, listOrders } from "@/lib/mailbox-operations";

// GET /api/mail/orders - the account's domain / inbox orders, newest first.
export async function GET(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    return NextResponse.json({ orders: await listOrders(user.id) });
  } catch (e) {
    return mailError(e, "GET /api/mail/orders");
  }
}

const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(6).max(30),
  organization: z.string().trim().max(120).optional(),
  address1: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().length(2),
});

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("domain"), domain: z.string().trim().min(4).max(253), contact: contactSchema }),
  z.object({
    kind: z.literal("inboxes"),
    vendor: z.enum(["agentmail", "premiuminboxes"]),
    domainId: z.string().uuid().nullable().optional(),
    quantity: z.number().int().min(1).max(10),
    usernames: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
    displayName: z.string().trim().max(120).nullable().optional(),
  }),
]);

// POST /api/mail/orders - start a purchase. Returns the order with a Stripe
// Checkout URL; fulfilment runs after payment (Stripe webhook -> Inngest).
export async function POST(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    const rate = await checkRateLimit(`mail:order:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

    const origin = appOrigin(req);
    const successUrl = `${origin}/settings?tab=mailboxes&order=success`;
    const cancelUrl = `${origin}/settings?tab=mailboxes&order=cancelled`;
    const body = parsed.data;
    const order =
      body.kind === "domain"
        ? await createDomainOrder(user.id, { domain: body.domain, contact: body.contact, successUrl, cancelUrl })
        : await createInboxOrder(user.id, { ...body, successUrl, cancelUrl });
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    return mailError(e, "POST /api/mail/orders");
  }
}
