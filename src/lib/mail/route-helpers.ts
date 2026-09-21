// Shared plumbing for the /api/mail/* REST routes: auth that accepts either
// a signed-in human or an agent API key, the OpError -> HTTP mapping, and
// the deployment capability flags the Settings UI renders its buttons from.

import { NextResponse } from "next/server";
import { OpError } from "@/lib/op-error";
import { resolveRequestUser, type DbUser } from "@/lib/auth-utils";
import { isAgentMailPlatformConfigured } from "@/lib/agentmail";
import { isSecretBoxConfigured } from "@/lib/secret-box";
import { configuredRegistrar } from "@/lib/mail/registrar";
import { stripeConfigured } from "@/lib/stripe";
import { INBOX_PRICE_USD_CENTS, DOMAIN_MARKUP_USD_CENTS, MAX_INBOXES_PER_DOMAIN } from "@/lib/mailbox-operations";

export async function requireMailUser(req: Request): Promise<DbUser> {
  const user = await resolveRequestUser(req);
  if (!user) throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return user;
}

export function mailError(e: unknown, label: string): NextResponse {
  if (e instanceof NextResponse) return e;
  if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(label, e);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}

export interface MailCapabilities {
  agentmail: boolean; // can create AgentMail inboxes
  smtp: boolean; // can store SMTP credentials (MAILBOX_SECRET_KEY)
  registrar: "GODADDY" | "PORKBUN" | null; // can buy domains
  billing: boolean; // Stripe configured (orders)
  inboxPriceUsdCents: number;
  domainMarkupUsdCents: number;
  maxInboxesPerDomain: number;
}

export function mailCapabilities(): MailCapabilities {
  return {
    agentmail: isAgentMailPlatformConfigured(),
    smtp: isSecretBoxConfigured(),
    registrar: configuredRegistrar()?.id ?? null,
    billing: stripeConfigured(),
    inboxPriceUsdCents: INBOX_PRICE_USD_CENTS(),
    domainMarkupUsdCents: DOMAIN_MARKUP_USD_CENTS(),
    maxInboxesPerDomain: MAX_INBOXES_PER_DOMAIN,
  };
}

export function appOrigin(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}
