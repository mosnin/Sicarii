// Job contract between the Next.js origin and the Cloudflare Worker.
// The Worker is the background plane (cron + queues). The origin still
// owns Prisma and SMTP: each job is one unit of work so a Vercel function
// stays well under the wall clock. When WORKERS_URL is unset, jobs run
// inline so local/dev still works. List jobs are always cursor-paginated.

import { OpError } from "@/lib/op-error";
import { workerSharedSecret } from "@/lib/worker-secret";
import {
  checkDomainDnsById,
  listDomainDnsPage,
  listImapMailboxPage,
  listPendingMailboxPage,
  listWarmingMailboxPage,
  pollPendingMailboxOrders,
  runWarmupForMailbox,
  runWarmupTick,
  sendOutreachEmail,
} from "@/lib/mailbox-operations";
import { ingestInboundEmail } from "@/lib/mailbox-inbound";
import { fulfillQueuedSend, listQueuedSendJobIds } from "@/lib/mailbox-queue";
import { pollMailboxImap } from "@/lib/mailbox-imap";
import { clampFanoutLimit, type IdPage } from "@/lib/mailbox-page";

export type MailboxJob =
  | { type: "warmup-tick" }
  | { type: "warmup-list"; cursor?: string | null; limit?: number }
  | { type: "warmup-one"; mailboxId: string }
  | { type: "send-slot-list"; cursor?: string | null; limit?: number }
  | { type: "send-one"; jobId: string }
  | { type: "outreach-tick"; cursor?: string | null; limit?: number }
  | {
      type: "send-email";
      userId: string;
      contactId: string;
      subject: string;
      body: string;
      mailboxId?: string;
      variantId?: string | null;
      allowWarming?: boolean;
    }
  | {
      type: "inbound-email";
      from: string;
      to: string;
      subject?: string;
      text: string;
      mailboxId?: string;
      providerId?: string;
      messageId?: string;
      inReplyTo?: string;
      references?: string;
    }
  | { type: "fulfill-poll" }
  | { type: "fulfill-list"; cursor?: string | null; limit?: number }
  | { type: "fulfill-one"; mailboxId?: string; orderId?: string }
  | { type: "imap-list"; cursor?: string | null; limit?: number }
  | { type: "imap-one"; mailboxId: string }
  | { type: "dns-list"; cursor?: string | null; limit?: number }
  | { type: "dns-one"; domainId: string };

export type EnqueueResult = {
  queued: boolean;
  ranInline: boolean;
  result?: unknown;
};

export function workersBackgroundConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.WORKERS_URL?.trim() && workerSharedSecret(env));
}

export function queueForJob(job: MailboxJob): "send" | "inbound" | "fulfill" {
  switch (job.type) {
    case "send-email":
    case "send-one":
    case "warmup-one":
    case "warmup-tick":
    case "outreach-tick":
      return "send";
    case "inbound-email":
    case "imap-one":
      return "inbound";
    default:
      return "fulfill";
  }
}

function listArgs(job: { cursor?: string | null; limit?: number }): { cursor?: string | null; limit: number } {
  return { cursor: job.cursor ?? null, limit: clampFanoutLimit(job.limit) };
}

export function parseMailboxJob(input: unknown): MailboxJob {
  if (!input || typeof input !== "object") throw new OpError("job is required", 400);
  const job = input as MailboxJob;
  if (typeof job.type !== "string") throw new OpError("job.type is required", 400);
  switch (job.type) {
    case "warmup-tick":
    case "fulfill-poll":
      return { type: job.type };
    case "warmup-list":
    case "fulfill-list":
    case "send-slot-list":
    case "outreach-tick":
    case "imap-list":
    case "dns-list":
      return { type: job.type, cursor: job.cursor ?? null, limit: job.limit };
    case "warmup-one":
    case "imap-one":
      if (!("mailboxId" in job) || !job.mailboxId) throw new OpError("mailboxId is required", 400);
      return { type: job.type, mailboxId: String(job.mailboxId) };
    case "dns-one":
      if (!job.domainId) throw new OpError("domainId is required", 400);
      return { type: "dns-one", domainId: String(job.domainId) };
    case "send-one":
      if (!job.jobId) throw new OpError("jobId is required", 400);
      return { type: "send-one", jobId: String(job.jobId) };
    case "fulfill-one":
      if (!job.mailboxId && !job.orderId) throw new OpError("mailboxId or orderId is required", 400);
      return { type: "fulfill-one", mailboxId: job.mailboxId, orderId: job.orderId };
    case "send-email":
      if (!job.userId || !job.contactId || !job.subject || !job.body) {
        throw new OpError("userId, contactId, subject, and body are required", 400);
      }
      return {
        type: "send-email",
        userId: String(job.userId),
        contactId: String(job.contactId),
        subject: String(job.subject),
        body: String(job.body),
        mailboxId: job.mailboxId,
        variantId: job.variantId ?? null,
        allowWarming: Boolean(job.allowWarming),
      };
    case "inbound-email":
      if (!job.from || !job.to || !job.text) throw new OpError("from, to, and text are required", 400);
      return {
        type: "inbound-email",
        from: String(job.from),
        to: String(job.to),
        subject: job.subject,
        text: String(job.text),
        mailboxId: job.mailboxId,
        providerId: job.providerId,
        messageId: job.messageId,
        inReplyTo: job.inReplyTo,
        references: job.references,
      };
    default:
      throw new OpError(`Unknown job type: ${(job as { type: string }).type}`, 400);
  }
}

async function asListResult(page: IdPage): Promise<IdPage & { mailboxIds: string[] }> {
  return { ...page, mailboxIds: page.ids };
}

export async function runMailboxJob(job: MailboxJob): Promise<unknown> {
  switch (job.type) {
    case "warmup-tick":
      return runWarmupTick();
    case "warmup-list":
      return asListResult(await listWarmingMailboxPage(job.cursor, job.limit));
    case "warmup-one":
      return runWarmupForMailbox(job.mailboxId);
    case "send-slot-list":
    case "outreach-tick":
      return asListResult(await listQueuedSendJobIds(listArgs(job)));
    case "send-one":
      return fulfillQueuedSend(job.jobId);
    case "send-email":
      return sendOutreachEmail(job.userId, {
        contactId: job.contactId,
        subject: job.subject,
        body: job.body,
        mailboxId: job.mailboxId,
        variantId: job.variantId,
        allowWarming: job.allowWarming,
      });
    case "inbound-email":
      return ingestInboundEmail(job);
    case "fulfill-poll":
      return pollPendingMailboxOrders();
    case "fulfill-list":
      return asListResult(await listPendingMailboxPage(job.cursor, job.limit));
    case "fulfill-one":
      return pollPendingMailboxOrders({ mailboxId: job.mailboxId, orderId: job.orderId });
    case "imap-list":
      return asListResult(await listImapMailboxPage(job.cursor, job.limit));
    case "imap-one":
      return pollMailboxImap(job.mailboxId);
    case "dns-list":
      return asListResult(await listDomainDnsPage(job.cursor, job.limit));
    case "dns-one":
      return checkDomainDnsById(job.domainId);
  }
}

export async function enqueueMailboxJob(job: MailboxJob): Promise<EnqueueResult> {
  if (!workersBackgroundConfigured()) {
    const result = await runMailboxJob(job);
    return { queued: false, ranInline: true, result };
  }
  const base = process.env.WORKERS_URL!.replace(/\/$/, "");
  const secret = workerSharedSecret()!;
  const res = await fetch(`${base}/enqueue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker enqueue failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return { queued: true, ranInline: false };
}

export async function enqueueMailboxJobSafe(job: MailboxJob): Promise<EnqueueResult | null> {
  try {
    return await enqueueMailboxJob(job);
  } catch (e) {
    console.error("[mailbox-jobs] enqueue failed", job.type, e);
    return null;
  }
}
