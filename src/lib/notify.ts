// Outbound task webhook. When a scheduled task completes, POST the results to the
// user's configured URL so their agent (openclaw, Hermes, etc.) can wake up.

export interface TaskWebhookPayload {
  event: "intent-monitor.completed" | "research-schedule.completed";
  taskId: string;
  name: string;
  query: string;
  created: number;
  items: Array<{ id: string; kind: "entity" | "contact"; name?: string | null; domain?: string | null; url?: string | null }>;
  completedAt: string;
}

// Best-effort POST. Never throws (a bad user URL must not fail the job).
export async function notifyTaskWebhook(url: string | null | undefined, payload: TaskWebhookPayload): Promise<void> {
  if (!url || !/^https?:\/\//i.test(url)) return;
  try {
    const res = await fetch(url, {
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
