// Job contract between the Next.js origin and the Cloudflare Worker.
// The Worker is the background plane (cron + queues). The origin still
// owns Prisma and SMTP: each job is one unit of work so a Vercel function
// stays well under the wall clock. When WORKERS_URL is unset, jobs run
// inline so local/dev still works.

import { OpError } from "@/lib/op-error";
import { workerSharedSecret } from "@/lib/worker-secret";
import {
  pollPendingMailboxOrders,
  runWarmupForMailbox,
  runWarmupTick,
  sendOutreachEmail,
} from "@/lib/mailbox-operations";
import { ingestInboundEmail } from "@/lib/mailbox-inbound";
import { prisma } from "@/lib/prisma";

export type MailboxJob =
  | { type: "warmup-tick" }
  | { type: "warmup-list" }
  | { type: "warmup-one"; mailboxId: string }
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
    }
  | { type: "fulfill-poll" }
  | { type: "fulfill-list" }
  | { type: "fulfill-one"; mailboxId?: string; orderId?: string };

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
    case "warmup-one":
    case "warmup-tick":
      return "send";
    case "inbound-email":
      return "inbound";
    default:
      return "fulfill";
  }
}

export function parseMailboxJob(input: unknown): MailboxJob {
  if (!input || typeof input !== "object") throw new OpError("job is required", 400);
  const job = input as MailboxJob;
  if (typeof job.type !== "string") throw new OpError("job.type is required", 400);
  switch (job.type) {
    case "warmup-tick":
    case "warmup-list":
    case "fulfill-poll":
    case "fulfill-list":
      return { type: job.type };
    case "warmup-one":
      if (!job.mailboxId) throw new OpError("mailboxId is required", 400);
      return { type: "warmup-one", mailboxId: String(job.mailboxId) };
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
      };
    default:
      throw new OpError(`Unknown job type: ${(job as { type: string }).type}`, 400);
  }
}

export async function runMailboxJob(job: MailboxJob): Promise<unknown> {
  switch (job.type) {
    case "warmup-tick":
      return runWarmupTick();
    case "warmup-list":
      return { mailboxIds: await listWarmingMailboxIds() };
    case "warmup-one":
      return runWarmupForMailbox(job.mailboxId);
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
      return { mailboxIds: await listPendingMailboxIds() };
    case "fulfill-one":
      return pollPendingMailboxOrders({ mailboxId: job.mailboxId, orderId: job.orderId });
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

async function listWarmingMailboxIds(): Promise<string[]> {
  const rows = await prisma.mailbox.findMany({
    where: { status: "warming" },
    select: { id: true },
    take: 200,
  });
  return rows.map((row) => row.id);
}

async function listPendingMailboxIds(): Promise<string[]> {
  const rows = await prisma.mailbox.findMany({
    where: { status: { in: ["requested", "provisioning"] } },
    select: { id: true },
    take: 200,
  });
  return rows.map((row) => row.id);
}
