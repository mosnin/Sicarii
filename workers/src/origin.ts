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

export async function listIds(
  env: Env,
  type: "warmup-list" | "fulfill-list",
): Promise<string[]> {
  const data = (await callOrigin(env, { type })) as { mailboxIds?: unknown };
  if (!Array.isArray(data.mailboxIds)) return [];
  return data.mailboxIds.filter((id): id is string => typeof id === "string" && id.length > 0);
}
