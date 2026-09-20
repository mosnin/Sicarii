// Outbound task webhook. When a scheduled task completes, POST the results to the
// user's configured URL so their agent (openclaw, Hermes, etc.) can wake up.

import { safeHttpUrl, resolvesToPublicIp } from "@/lib/ssrf";

export interface TaskWebhookPayload {
  event: "intent-monitor.completed" | "research-schedule.completed" | "autopilot-plan.completed";
  taskId: string;
  name: string;
  query: string;
  created: number;
  items: Array<{ id: string; kind: "entity" | "contact"; name?: string | null; domain?: string | null; url?: string | null }>;
  completedAt: string;
}

// Best-effort POST. Never throws (a bad user URL must not fail the job). The URL
// is SSRF-checked so it can't be aimed at localhost / internal / cloud-metadata.
export async function notifyTaskWebhook(url: string | null | undefined, payload: TaskWebhookPayload): Promise<void> {
  const safe = safeHttpUrl(url);
  if (!safe) {
    if (url) console.warn(`[notify] refusing webhook to blocked/invalid URL: ${url}`);
    return;
  }
  // DNS-rebinding defense: the hostname must resolve to public addresses only.
  if (!(await resolvesToPublicIp(safe.hostname))) {
    console.warn(`[notify] refusing webhook: ${safe.hostname} resolves to a private/blocked address`);
    return;
  }
  try {
    const res = await fetch(safe.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Scalar-Webhook/1" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[notify] ${payload.event} -> ${url} (${res.status})`);
  } catch (e) {
    console.warn(`[notify] webhook to ${url} failed`, e);
  }
}
