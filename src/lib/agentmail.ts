// AgentMail client — per-user key (User.agentMailApiKey). Used to surface email
// threads with a contact on their CRM page. Best-effort: response shapes vary,
// so we match a contact by their email appearing anywhere in a thread.
// Docs: https://docs.agentmail.to  Base: https://api.agentmail.to/v0

const BASE = "https://api.agentmail.to/v0";

export function isAgentMailConfigured(key?: string | null): boolean {
  return Boolean(key && key.trim());
}

async function amGet<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AgentMail ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export interface AgentMailThread {
  id: string;
  subject: string;
  preview?: string;
  updatedAt?: string;
  from?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// Fetch threads (across the account's inboxes) that involve a given contact email.
export async function getThreadsForContact(
  key: string,
  email: string,
  max = 25
): Promise<AgentMailThread[]> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return [];

  // 1) List inboxes.
  const inboxesRes = await amGet<{ inboxes?: unknown[]; data?: unknown[] }>(key, "/inboxes");
  const inboxes = (inboxesRes.inboxes ?? inboxesRes.data ?? []) as Record<string, unknown>[];

  const out: AgentMailThread[] = [];
  for (const inbox of inboxes.slice(0, 5)) {
    const inboxId =
      str(inbox.inbox_id) ?? str(inbox.id) ?? str(inbox.email_address) ?? str(inbox.address);
    if (!inboxId) continue;

    let threadsRes: { threads?: unknown[]; data?: unknown[] };
    try {
      threadsRes = await amGet(key, `/inboxes/${encodeURIComponent(inboxId)}/threads?limit=100`);
    } catch {
      continue;
    }
    const threads = (threadsRes.threads ?? threadsRes.data ?? []) as Record<string, unknown>[];

    for (const t of threads) {
      // Match the contact by their email appearing anywhere in the thread.
      if (!JSON.stringify(t).toLowerCase().includes(wanted)) continue;
      const last = (t.last_message ?? t.latest_message) as Record<string, unknown> | undefined;
      out.push({
        id: str(t.thread_id) ?? str(t.id) ?? "",
        subject: str(t.subject) ?? "(no subject)",
        preview: str(t.preview) ?? str(t.snippet) ?? str(last?.text) ?? str(last?.preview),
        updatedAt: str(t.updated_at) ?? str(t.timestamp) ?? str(t.created_at),
        from: str(last?.from) ?? str(t.from),
      });
    }
  }

  return out
    .filter((t) => t.id)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, max);
}
