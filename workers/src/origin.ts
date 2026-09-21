import type { Env, MailboxJob } from "./types";

export async function callOrigin(env: Env, job: MailboxJob): Promise<unknown> {
  const base = env.ORIGIN_URL?.replace(/\/$/, "");
  if (!base) throw new Error("ORIGIN_URL is not set on the worker.");
  if (!env.WORKER_SECRET) throw new Error("WORKER_SECRET is not set on the worker.");

  const res = await fetch(`${base}/api/internal/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WORKER_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Origin job ${job.type} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  return text ? JSON.parse(text) : {};
}

export type IdPage = { ids: string[]; nextCursor: string | null };

export async function listPage(
  env: Env,
  job: Extract<
    MailboxJob,
    { type: "warmup-list" | "fulfill-list" | "send-slot-list" | "outreach-tick" | "imap-list" | "dns-list" }
  >,
): Promise<IdPage> {
  const data = (await callOrigin(env, job)) as {
    result?: { ids?: unknown; mailboxIds?: unknown; nextCursor?: unknown };
    ids?: unknown;
    mailboxIds?: unknown;
    nextCursor?: unknown;
  };
  const body = data.result && typeof data.result === "object" ? data.result : data;
  const raw = Array.isArray(body.ids) ? body.ids : Array.isArray(body.mailboxIds) ? body.mailboxIds : [];
  const ids = raw.filter((id): id is string => typeof id === "string" && id.length > 0);
  const nextCursor = typeof body.nextCursor === "string" && body.nextCursor.length > 0 ? body.nextCursor : null;
  return { ids, nextCursor };
}
