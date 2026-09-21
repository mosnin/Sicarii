import { authorize } from "./auth";
import type { ExecutionContext, ForwardableEmailMessage, MessageBatch, ScheduledController } from "./cf";
import { parseRawEmail } from "./email";
import { callOrigin, listIds } from "./origin";
import { queueNameFor, type Env, type MailboxJob } from "./types";

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

export async function handleScheduled(cron: string, env: Env): Promise<{ enqueued: number; type: string }> {
  if (cron === WARMUP_CRON) {
    const ids = await listIds(env, "warmup-list");
    await Promise.all(ids.map((mailboxId) => env.SEND_QUEUE.send({ type: "warmup-one", mailboxId })));
    return { enqueued: ids.length, type: "warmup-one" };
  }
  const ids = await listIds(env, "fulfill-list");
  await Promise.all(ids.map((mailboxId) => env.FULFILL_QUEUE.send({ type: "fulfill-one", mailboxId })));
  return { enqueued: ids.length, type: "fulfill-one" };
}

export async function handleQueueBatch(batch: MessageBatch<MailboxJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      await callOrigin(env, message.body);
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
    ctx.waitUntil(handleScheduled(controller.cron, env).then((result) => {
      console.log("[scalar-mailbox-jobs] cron", controller.cron, result);
    }));
  },

  async queue(batch: MessageBatch<MailboxJob>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const raw = await new Response(message.raw).text();
    await handleInboundEmail(raw, env, { from: message.from, to: message.to });
  },
};
