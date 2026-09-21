// Premium Inboxes partner adapter.
//
// Premium Inboxes (https://premiuminboxes.com/) provisions official Google
// Workspace / Microsoft 365 inboxes and starts warmup. They advertise API
// access but do not publish a public purchase contract, so this module is an
// honest adapter:
//   - When PREMIUM_INBOXES_API_KEY + PREMIUM_INBOXES_API_URL are set, we POST
//     an order and store the returned order id.
//   - When they are not set, placeInboxOrder records a pending order locally
//     and returns { status: "pending_fulfillment" } so checkout still works.
// Their webhook (signed with PREMIUM_INBOXES_WEBHOOK_SECRET) is how a
// provisioned inbox becomes warming/ready.

import { createHmac, timingSafeEqual } from "crypto";
import { fetchWithTimeout } from "@/lib/http";

export interface InboxOrderInput {
  userId: string;
  domain?: string;
  localPart: string;
  displayName?: string;
  platform?: "google_workspace" | "microsoft_365";
  count?: number;
}

export interface InboxOrderResult {
  orderId: string;
  status: "submitted" | "pending_fulfillment";
  email?: string;
  detail: string;
}

export interface ProvisionedInbox {
  email: string;
  displayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  providerInboxId?: string;
}

export function premiumInboxesConfigured(): boolean {
  return Boolean(process.env.PREMIUM_INBOXES_API_KEY?.trim() && process.env.PREMIUM_INBOXES_API_URL?.trim());
}

export async function placeInboxOrder(input: InboxOrderInput): Promise<InboxOrderResult> {
  const local = input.localPart.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!local) throw new Error("localPart is required.");
  const email = input.domain ? `${local}@${input.domain.replace(/^@/, "").toLowerCase()}` : undefined;

  if (!premiumInboxesConfigured()) {
    return {
      orderId: `local_${input.userId.slice(0, 8)}_${Date.now()}`,
      status: "pending_fulfillment",
      email,
      detail:
        "Premium Inboxes API is not configured. The mailbox is recorded as requested. Set PREMIUM_INBOXES_API_KEY and PREMIUM_INBOXES_API_URL to place a live order, or connect SMTP when the inbox arrives.",
    };
  }

  const base = process.env.PREMIUM_INBOXES_API_URL!.replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PREMIUM_INBOXES_API_KEY!.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workspaceId: input.userId,
      domain: input.domain,
      localPart: local,
      displayName: input.displayName,
      platform: input.platform ?? "google_workspace",
      count: input.count ?? 1,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz"}/api/webhooks/premium-inboxes`,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Premium Inboxes order failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (text ? JSON.parse(text) : {}) as { id?: string; orderId?: string; email?: string };
  return {
    orderId: data.orderId ?? data.id ?? `pi_${Date.now()}`,
    status: "submitted",
    email: data.email ?? email,
    detail: "Order submitted to Premium Inboxes.",
  };
}

export function verifyPremiumInboxesSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.PREMIUM_INBOXES_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export type InboxOrderStatus = {
  orderId: string;
  ready: boolean;
  email?: string;
  providerInboxId?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
  };
  detail: string;
};

/** Poll a partner order. Returns null when the API is unset or the order is
 *  still pending. Never invents SMTP credentials. */
export async function fetchInboxOrder(orderId: string): Promise<InboxOrderStatus | null> {
  if (!orderId || orderId.startsWith("local_")) return null;
  if (!premiumInboxesConfigured()) return null;

  const base = process.env.PREMIUM_INBOXES_API_URL!.replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${process.env.PREMIUM_INBOXES_API_KEY!.trim()}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Premium Inboxes order status failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (text ? JSON.parse(text) : {}) as {
    id?: string;
    orderId?: string;
    status?: string;
    email?: string;
    providerInboxId?: string;
    smtp?: {
      host?: string;
      port?: number;
      secure?: boolean;
      username?: string;
      password?: string;
    };
  };
  const status = (data.status ?? "").toLowerCase();
  const ready = status === "ready" || status === "provisioned" || status === "active" || Boolean(data.smtp?.host);
  const smtp =
    data.smtp?.host && data.smtp.username && data.smtp.password
      ? {
          host: data.smtp.host,
          port: data.smtp.port ?? 587,
          secure: Boolean(data.smtp.secure),
          username: data.smtp.username,
          password: data.smtp.password,
        }
      : undefined;
  return {
    orderId: data.orderId ?? data.id ?? orderId,
    ready,
    email: data.email,
    providerInboxId: data.providerInboxId,
    smtp,
    detail: ready ? "Inbox is provisioned." : `Order is ${data.status ?? "pending"}.`,
  };
}
