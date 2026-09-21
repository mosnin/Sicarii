// Inbound mail ingest: match a mailbox by To, a contact by From, classify
// the message, then only a REPLY writes the CRM trail. Warmup never
// touches contacts. Bounce and unsubscribe set doNotContact.

import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { recordInboundReply, recordMailboxFailure, setDoNotContact } from "@/lib/mailbox-operations";
import {
  classifyInbound,
  inboundSetsDoNotContact,
  inboundTouchesCrm,
  type InboundClass,
} from "@/lib/mailbox-classifier";
import { BOUNCE_SPIKE_MIN, BOUNCE_SPIKE_RATE, shouldAutoPause } from "@/lib/mailbox-health";

export type InboundEmailInput = {
  from: string;
  to: string;
  subject?: string;
  text: string;
  mailboxId?: string;
  providerId?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
};

export type InboundEmailResult = {
  matched: boolean;
  mailboxId: string;
  contactId?: string;
  emailId?: string;
  classification: InboundClass;
};

function normalizeAddr(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const angled = trimmed.match(/<([^>]+)>/);
  return (angled?.[1] ?? trimmed).replace(/^mailto:/, "");
}

function warmupTargetsOf(box: { warmupTargets: unknown }): string[] {
  if (Array.isArray(box.warmupTargets)) {
    return box.warmupTargets.filter((v): v is string => typeof v === "string" && v.includes("@"));
  }
  return [];
}

async function maybePauseOnBounceSpike(mailboxId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [bounces, sends] = await Promise.all([
    prisma.mailboxEvent.count({ where: { mailboxId, kind: "bounce", createdAt: { gte: since } } }),
    prisma.mailboxEvent.count({
      where: { mailboxId, kind: { in: ["outreach", "warmup"] }, createdAt: { gte: since } },
    }),
  ]);
  const pause = shouldAutoPause({
    consecutiveFailures: 0,
    healthScore: 100,
    bounceCount: bounces,
    sendCount: sends,
  });
  if (pause === "bounce_spike" || (bounces >= BOUNCE_SPIKE_MIN && sends > 0 && bounces / sends >= BOUNCE_SPIKE_RATE)) {
    await recordMailboxFailure(mailboxId, "bounce spike");
  }
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

  const classification = classifyInbound({
    from,
    to,
    subject: input.subject,
    text,
    mailboxEmail: box.email,
    warmupTargets: warmupTargetsOf(box),
    warmupSink: process.env.WARMUP_SINK_EMAIL ?? null,
  });

  const contact = await prisma.contact.findFirst({
    where: { userId: box.userId, email: { equals: from, mode: "insensitive" } },
    select: { id: true },
  });

  await prisma.mailbox.update({
    where: { id: box.id },
    data: { lastInboundAt: new Date() },
  });

  const eventKind =
    classification === "BOUNCE" ? "bounce" : classification === "WARMUP" ? "warmup" : "reply";

  if (!contact || !inboundTouchesCrm(classification)) {
    await prisma.mailboxEvent.create({
      data: {
        mailboxId: box.id,
        kind: eventKind,
        contactId: contact?.id ?? null,
        toAddr: from,
        subject: input.subject ?? null,
        providerId: input.providerId ?? null,
        messageId: input.messageId ?? null,
        inReplyTo: input.inReplyTo ?? null,
        references: input.references ?? null,
        classification,
        meta: { unmatched: !contact, to },
      },
    });
    if (contact && inboundSetsDoNotContact(classification)) {
      await setDoNotContact(box.userId, contact.id, classification.toLowerCase());
    }
    if (classification === "BOUNCE") await maybePauseOnBounceSpike(box.id);
    return { matched: Boolean(contact), mailboxId: box.id, contactId: contact?.id, classification };
  }

  const saved = await recordInboundReply(box.userId, {
    contactId: contact.id,
    mailboxId: box.id,
    subject: input.subject,
    body: text,
    fromAddr: from,
    toAddr: to,
    providerId: input.providerId,
    messageId: input.messageId,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });
  return {
    matched: true,
    mailboxId: box.id,
    contactId: contact.id,
    emailId: saved.id,
    classification,
  };
}
