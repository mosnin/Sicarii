// PremiumInboxes fulfillment adapter (Card 0015).
//
// PremiumInboxes sells done-for-you Google Workspace / Microsoft 365 inboxes
// ($2.80–3.50/mo per inbox at volume, human-verified SPF/DKIM/DMARC, <6h
// delivery, unlimited replacements). Key fact from research: they do NOT sell
// domains — "bring your own domains" — which is exactly why Scalar pairs them
// with the GoDaddy domain shelf.
//
// Their site exposes an API page but no public spec, and no key has ever been
// exercised here. So this module is a fulfillment ADAPTER with two modes:
//   1. API mode (PREMIUMINBOXES_API_KEY set): submits the structured order
//      payload to their intake endpoint. Base URL + paths are overridable via
//      PREMIUMINBOXES_API_BASE because the spec is unverified — when the real
//      spec lands, only the transport below changes, not the ops layer.
//   2. Manual mode (no key): builds the exact intake CSV + human checklist the
//      ops team pastes into their intake form, and the order sits in
//      `ordered` until mailbox rows are confirmed. Honest placeholder, not a
//      fake integration.
//
// Either way Scalar NEVER holds mailbox credentials: PremiumInboxes owns the
// Workspace/M365 auth; we store only the provider inbox ref + status.

import { fetchWithTimeout } from "@/lib/http";
import type { MailboxPlatform } from "./types";

export function isPremiumInboxesConfigured(key?: string | null): boolean {
  return Boolean((key ?? process.env.PREMIUMINBOXES_API_KEY)?.trim());
}

function apiBase(): string {
  return (process.env.PREMIUMINBOXES_API_BASE ?? "https://premiuminboxes.com/api").replace(/\/$/, "");
}

export interface InboxOrderLine {
  domain: string;
  count: number;
  platform: MailboxPlatform; // "google" | "microsoft"
  /** Local parts requested, e.g. ["leo","mia"] — provider may adjust. */
  localParts?: string[];
}

export interface InboxOrder {
  lines: InboxOrderLine[];
  /** Where the inboxes should be uploaded (sequencer target). */
  sequencerTarget?: string;
  /** Webhook/email the provider notifies on completion. */
  notifyEmail?: string;
  customerRef?: string;
}

export interface InboxOrderResult {
  mode: "api" | "manual";
  providerOrderId: string | null;
  /** Human-readable next step when mode === "manual". */
  nextStep: string | null;
}

/** Validate an order before it touches the provider or the DB. Returns the error, or null when valid. */
export function validateInboxOrder(order: InboxOrder): string | null {
  if (!Array.isArray(order.lines) || order.lines.length === 0) return "order needs at least one domain line";
  if (order.lines.length > 20) return "max 20 domain lines per order";
  for (const line of order.lines) {
    if (!line.domain || line.domain.length > 253) return `bad domain on line: ${String(line.domain)}`;
    if (!Number.isInteger(line.count) || line.count < 1 || line.count > 100)
      return `count must be 1–100 for ${line.domain}`;
    if (line.platform !== "google" && line.platform !== "microsoft")
      return `platform must be google|microsoft for ${line.domain}`;
    if (line.localParts && line.localParts.length > line.count)
      return `more local parts than inboxes for ${line.domain}`;
  }
  return null;
}

/** Total inbox count across lines (for pricing math + fulfillment checks). */
export function orderInboxCount(order: InboxOrder): number {
  return order.lines.reduce((n, l) => n + l.count, 0);
}

/**
 * Render the manual-fulfillment CSV: one row per requested inbox. Ops pastes
 * this into the PremiumInboxes intake form when no API key is configured.
 */
export function renderIntakeCsv(order: InboxOrder): string {
  const rows = ["domain,platform,local_part,sequencer_target,customer_ref"];
  for (const line of order.lines) {
    for (let i = 0; i < line.count; i++) {
      const local = line.localParts?.[i] ?? `inbox${i + 1}`;
      rows.push(
        [line.domain, line.platform, local, order.sequencerTarget ?? "", order.customerRef ?? ""]
          .map((c) => `"${c.replace(/"/g, '""')}"`)
          .join(","),
      );
    }
  }
  return rows.join("\n");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Submit an inbox order. API mode POSTs the structured payload; manual mode
 * returns the CSV checklist without any network call.
 */
export async function submitInboxOrder(
  order: InboxOrder,
  opts: { apiKey?: string } = {},
): Promise<InboxOrderResult> {
  const invalid = validateInboxOrder(order);
  if (invalid) throw new Error(`Invalid inbox order: ${invalid}`);

  const key = (opts.apiKey ?? process.env.PREMIUMINBOXES_API_KEY ?? "").trim();
  if (!key) {
    return {
      mode: "manual",
      providerOrderId: null,
      nextStep:
        "No PREMIUMINBOXES_API_KEY — paste the intake CSV (renderIntakeCsv) into the PremiumInboxes intake form. Mailboxes stay `ordered` until confirmed.",
    };
  }

  const res = await fetchWithTimeout(`${apiBase()}/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...order, customerRef: order.customerRef ?? undefined }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PremiumInboxes order failed (${res.status}): ${text.slice(0, 300)}`);
  const raw: unknown = text ? JSON.parse(text) : {};
  const providerOrderId =
    isRecord(raw) ? (str(raw.order_id) ?? str(raw.orderId) ?? str(raw.id) ?? null) : null;
  if (!providerOrderId) console.warn("[premiuminboxes] order accepted but id shape unknown");
  return { mode: "api", providerOrderId, nextStep: null };
}

export interface ProviderInboxStatus {
  email: string;
  status: "provisioning" | "warming" | "ready" | "replaced" | "unknown";
  providerRef: string | null;
}

/**
 * Poll provider-side inbox statuses for an order. Manual mode returns [] (the
 * ops team confirms delivery, which flips rows via confirmMailboxes in the ops
 * layer) — never fake statuses.
 */
export async function pollInboxStatuses(
  providerOrderId: string,
  opts: { apiKey?: string } = {},
): Promise<ProviderInboxStatus[]> {
  const key = (opts.apiKey ?? process.env.PREMIUMINBOXES_API_KEY ?? "").trim();
  if (!key) return [];
  const res = await fetchWithTimeout(`${apiBase()}/orders/${encodeURIComponent(providerOrderId)}/inboxes`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PremiumInboxes status poll failed (${res.status}): ${text.slice(0, 300)}`);
  const raw: unknown = text ? JSON.parse(text) : {};
  const list = isRecord(raw) && Array.isArray(raw.inboxes) ? raw.inboxes : [];
  const out: ProviderInboxStatus[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const email = str(item.email ?? item.address);
    if (!email) continue;
    const s = str(item.status)?.toLowerCase();
    out.push({
      email: email.toLowerCase(),
      status: s === "ready" || s === "warming" || s === "provisioning" || s === "replaced" ? s : "unknown",
      providerRef: str(item.inbox_id ?? item.id) ?? null,
    });
  }
  return out;
}
