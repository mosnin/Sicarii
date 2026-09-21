import { authorize } from "./auth";
import type { ExecutionContext, ForwardableEmailMessage, MessageBatch, ScheduledController } from "./cf";
import { parseRawEmail } from "./email";
import { callOrigin, listPage } from "./origin";
import { isListJob, queueNameFor, type Env, type MailboxJob } from "./types";

const WARMUP_CRON = "20 * * * *";

export { parseRawEmail, queueNameFor };

export async function handleEnqueue(req: Request, env: Env): Promise<Response> {
  if (!(await authorize(req.headers.get("authorization"), env.WORKER_SECRET))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { job?: MailboxJob } | null;
  const job = body?.job;
  if (!job || typeof job.type !== "string") {
    return Response.json({ error: "job is required" }, { status: 400 });
  }
  const binding = queueNameFor(job);
  await env[binding].send(job);
  return Response.json({ queued: true, queue: binding, type: job.type });
}

async function fanOutList(
  env: Env,
  listJob: Extract<
    MailboxJob,
    { type: "warmup-list" | "fulfill-list" | "send-slot-list" | "outreach-tick" | "imap-list" | "dns-list" }
  >,
): Promise<{ enqueued: number; type: string; nextCursor: string | null }> {
  const page = await listPage(env, listJob);
  const ones: MailboxJob[] = page.ids.map((id) => {
    switch (listJob.type) {
      case "warmup-list":
        return { type: "warmup-one", mailboxId: id };
      case "fulfill-list":
        return { type: "fulfill-one", mailboxId: id };
      case "imap-list":
        return { type: "imap-one", mailboxId: id };
      case "dns-list":
        return { type: "dns-one", domainId: id };
      case "send-slot-list":
      case "outreach-tick":
        return { type: "send-one", jobId: id };
    }
  });
  await Promise.all(ones.map((job) => env[queueNameFor(job)].send(job)));
  if (page.nextCursor) {
    const next: MailboxJob = { ...listJob, cursor: page.nextCursor };
    await env.FULFILL_QUEUE.send(next);
  }
  return { enqueued: ones.length, type: ones[0]?.type ?? listJob.type, nextCursor: page.nextCursor };
}

export async function handleScheduled(cron: string, env: Env): Promise<{ enqueued: number; type: string }[]> {
  if (cron === WARMUP_CRON) {
    const results = await Promise.all([
      fanOutList(env, { type: "warmup-list" }),
      fanOutList(env, { type: "send-slot-list" }),
      fanOutList(env, { type: "dns-list" }),
    ]);
    return results;
  }
  return Promise.all([fanOutList(env, { type: "fulfill-list" }), fanOutList(env, { type: "imap-list" })]);
}

export async function handleQueueBatch(batch: MessageBatch<MailboxJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      if (isListJob(message.body)) {
        await fanOutList(env, message.body);
      } else {
        await callOrigin(env, message.body);
      }
      message.ack();
    } catch (e) {
      console.error("[scalar-mailbox-jobs] job failed", message.body.type, e);
      message.retry();
    }
  }
}

export async function handleInboundEmail(
  raw: string,
  env: Env,
  envelope: { from?: string; to?: string },
): Promise<void> {
  const parsed = parseRawEmail(raw, envelope);
  await env.INBOUND_QUEUE.send({
    type: "inbound-email",
    from: parsed.from || envelope.from || "",
    to: parsed.to || envelope.to || "",
    subject: parsed.subject,
    text: parsed.text,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        origin: Boolean(env.ORIGIN_URL),
        worker: "scalar-mailbox-jobs",
      });
    }
    if (req.method === "POST" && url.pathname === "/enqueue") {
      return handleEnqueue(req, env);
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      handleScheduled(controller.cron, env).then((result) => {
        console.log("[scalar-mailbox-jobs] cron", controller.cron, result);
      }),
    );
  },

  async queue(batch: MessageBatch<MailboxJob>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const raw = await new Response(message.raw).text();
    await handleInboundEmail(raw, env, { from: message.from, to: message.to });
  },
};
