// Inbound mail ingest: match a mailbox by To, a contact by From, then
// saveEmail so REPLIED + variant attribution run on the same path as a
// human-saved thread. Unmatched senders stay on the mailbox event log
// and do not invent a contact.

import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { recordInboundReply } from "@/lib/mailbox-operations";

export type InboundEmailInput = {
  from: string;
  to: string;
  subject?: string;
  text: string;
  mailboxId?: string;
  providerId?: string;
};

export type InboundEmailResult = {
  matched: boolean;
  mailboxId: string;
  contactId?: string;
  emailId?: string;
};

function normalizeAddr(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const angled = trimmed.match(/<([^>]+)>/);
  return (angled?.[1] ?? trimmed).replace(/^mailto:/, "");
}

export async function ingestInboundEmail(input: InboundEmailInput): Promise<InboundEmailResult> {
  const from = normalizeAddr(input.from);
  const to = normalizeAddr(input.to);
  if (!from.includes("@") || !to.includes("@")) {
    throw new OpError("from and to must be email addresses.", 400);
  }
  const text = input.text.trim();
  if (!text) throw new OpError("text is required.", 400);

  const box = input.mailboxId
    ? await prisma.mailbox.findUnique({ where: { id: input.mailboxId } })
    : await prisma.mailbox.findFirst({ where: { email: to } });
  if (!box) throw new OpError("Mailbox not found for that recipient.", 404);

  const contact = await prisma.contact.findFirst({
    where: { userId: box.userId, email: { equals: from, mode: "insensitive" } },
    select: { id: true },
  });

  if (!contact) {
    await prisma.mailboxEvent.create({
      data: {
        mailboxId: box.id,
        kind: "reply",
        toAddr: from,
        subject: input.subject ?? null,
        providerId: input.providerId ?? null,
        meta: { unmatched: true, to },
      },
    });
    return { matched: false, mailboxId: box.id };
  }

  const saved = await recordInboundReply(box.userId, {
    contactId: contact.id,
    mailboxId: box.id,
    subject: input.subject,
    body: text,
    fromAddr: from,
    toAddr: to,
    providerId: input.providerId,
  });
  return { matched: true, mailboxId: box.id, contactId: contact.id, emailId: saved.id };
}
