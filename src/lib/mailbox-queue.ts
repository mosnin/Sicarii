// Queued bulk send. Agent send_email stays synchronous. High volume goes
// through MailboxSendJob with an idempotency key so retries do not double-send.
// Tenant isolation is userId on every row. One tenant cannot starve another:
// workspace concurrency is capped per user.

import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { sendOutreachEmail } from "@/lib/mailbox-operations";
import { clampFanoutLimit, decodeIdCursor, emptyIdPage, pageFromIds, type IdPage } from "@/lib/mailbox-page";

export const WORKSPACE_SEND_CONCURRENCY = 8;

export type EnqueueOutreachInput = {
  contactId: string;
  subject: string;
  body: string;
  mailboxId: string;
  variantId?: string | null;
  idempotencyKey?: string;
};

export function defaultSendIdempotencyKey(input: {
  userId: string;
  mailboxId: string;
  contactId: string;
  subject: string;
  body: string;
}): string {
  if (input.subject.length + input.body.length === 0) {
    return `${input.userId}:${input.mailboxId}:${input.contactId}:outreach`;
  }
  return `${input.userId}:${input.mailboxId}:${input.contactId}:${input.subject.trim()}:${input.body.trim().slice(0, 80)}`;
}

export async function enqueueOutreach(
  userId: string,
  input: EnqueueOutreachInput,
): Promise<{ jobId: string; status: string; deduped: boolean }> {
  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  if (contact.doNotContact) {
    throw new OpError(
      `Contact is on the do-not-contact list${contact.doNotContactReason ? ` (${contact.doNotContactReason})` : ""}.`,
      409,
    );
  }
  const box = await prisma.mailbox.findUnique({ where: { id: input.mailboxId } });
  if (!box || box.userId !== userId) throw new OpError("Mailbox not found", 404);

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new OpError("subject and body are required.", 400);

  const idempotencyKey = (input.idempotencyKey?.trim() ||
    defaultSendIdempotencyKey({
      userId,
      mailboxId: input.mailboxId,
      contactId: input.contactId,
      subject,
      body,
    })).slice(0, 240);

  const existing = await prisma.mailboxSendJob.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.userId !== userId) throw new OpError("Send job not found", 404);
    return { jobId: existing.id, status: existing.status, deduped: true };
  }

  try {
    const row = await prisma.mailboxSendJob.create({
      data: {
        userId,
        mailboxId: input.mailboxId,
        contactId: input.contactId,
        idempotencyKey,
        kind: "outreach",
        status: "queued",
        subject,
        body,
        variantId: input.variantId ?? null,
      },
    });
    return { jobId: row.id, status: row.status, deduped: false };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2002") {
      const again = await prisma.mailboxSendJob.findUnique({ where: { idempotencyKey } });
      if (again && again.userId === userId) {
        return { jobId: again.id, status: again.status, deduped: true };
      }
    }
    throw e;
  }
}

export async function listQueuedSendJobIds(input?: {
  cursor?: string | null;
  limit?: number;
  now?: Date;
}): Promise<IdPage> {
  const take = clampFanoutLimit(input?.limit);
  const after = decodeIdCursor(input?.cursor);
  const now = input?.now ?? new Date();
  const rows = await prisma.mailboxSendJob.findMany({
    where: {
      status: "queued",
      scheduledAt: { lte: now },
      ...(after ? { id: { gt: after } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  return pageFromIds(rows, take);
}

export async function workspaceRunningSends(userId: string): Promise<number> {
  return prisma.mailboxSendJob.count({
    where: { userId, status: "running" },
  });
}

export async function fulfillQueuedSend(
  jobId: string,
): Promise<{ sent: boolean; skipped?: string; emailId?: string }> {
  const job = await prisma.mailboxSendJob.findUnique({ where: { id: jobId } });
  if (!job) return { sent: false, skipped: "missing" };
  if (job.status === "sent") return { sent: false, skipped: "already_sent" };
  if (job.status === "skipped") return { sent: false, skipped: "skipped" };

  const running = await workspaceRunningSends(job.userId);
  if (running >= WORKSPACE_SEND_CONCURRENCY) {
    return { sent: false, skipped: "workspace_concurrency" };
  }

  await prisma.mailboxSendJob.update({
    where: { id: job.id },
    data: { status: "running", attemptCount: { increment: 1 } },
  });

  try {
    const result = await sendOutreachEmail(job.userId, {
      contactId: job.contactId,
      subject: job.subject,
      body: job.body,
      mailboxId: job.mailboxId,
      variantId: job.variantId,
    });
    await prisma.mailboxSendJob.update({
      where: { id: job.id },
      data: { status: "sent", lastError: null },
    });
    return { sent: true, emailId: result.emailId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "queued send failed";
    const status = message.includes("do-not-contact") || message.includes("halted") ? "skipped" : "failed";
    await prisma.mailboxSendJob.update({
      where: { id: job.id },
      data: { status, lastError: message.slice(0, 500) },
    });
    if (status === "skipped") return { sent: false, skipped: message };
    throw e;
  }
}

export async function listQueuedSendJobPage(cursor?: string | null, limit?: number): Promise<IdPage> {
  try {
    return await listQueuedSendJobIds({ cursor, limit });
  } catch {
    return emptyIdPage(clampFanoutLimit(limit));
  }
}
