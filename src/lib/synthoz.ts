// Synthoz enrichment API client.
//
// Request shapes are taken from the Synthoz dashboard ("USE THE API" panels):
// every call POSTs JSON containing `api_key` plus action-specific fields to
//   https://myapiconnect.com/api-product/incoming-webhook/<action>
//
// The response shapes are not yet documented to us, so callers store the raw
// JSON (e.g. on `entity.enrichment`) and extraction is refined once we see real
// responses. The API key is read from SYNTHOZ_API_KEY (set on the deployment).

import { recordSynthozJob } from "@/lib/synthoz-jobs";

const BASE = "https://myapiconnect.com/api-product/incoming-webhook";

/**
 * Context for an async call. `userId` lets us stamp a correlation job so the
 * result that POSTs back to /api/webhooks/synthoz is attributed to the right
 * Scalar user (Synthoz itself carries no user identity).
 */
export interface SynthozCtx {
  userId?: string;
}

export class SynthozNotConfiguredError extends Error {
  constructor() {
    super("SYNTHOZ_API_KEY is not set");
    this.name = "SynthozNotConfiguredError";
  }
}

/**
 * Thrown when Synthoz responds with { state: false } for an async tool.
 * This is NOT a failure - it means the request was queued and the result
 * will arrive via the outgoing webhook. Callers should surface "processing"
 * to the user rather than an error.
 */
export class SynthozQueuedError extends Error {
  constructor() {
    super("Request queued - result will be delivered via webhook");
    this.name = "SynthozQueuedError";
  }
}

export function isSynthozConfigured(): boolean {
  return Boolean(process.env.SYNTHOZ_API_KEY?.trim());
}

async function call(
  action: string,
  payload: Record<string, unknown>,
  ctx?: SynthozCtx
) {
  const apiKey = process.env.SYNTHOZ_API_KEY?.trim();
  if (!apiKey) throw new SynthozNotConfiguredError();

  const res = await fetch(`${BASE}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, ...payload }),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  // Diagnostic - log the masked key fingerprint + Synthoz's raw response so
  // failures are inspectable in the deployment logs. The fingerprint lets you
  // confirm the DEPLOYED key is your real one (and not the docs' example key).
  const fp = `${apiKey.slice(0, 6)}…${apiKey.slice(-4)} (len ${apiKey.length})`;
  console.log(`[synthoz] ${action} key=${fp} → ${res.status}: ${text.slice(0, 600)}`);

  // Detect hard auth failures regardless of status or envelope shape.
  const flat = (typeof data === "string" ? data : JSON.stringify(data ?? "")).toLowerCase();
  if (
    flat.includes("no api key") ||
    flat.includes("invalid api key") ||
    flat.includes("api key not") ||
    flat.includes("api_key not")
  ) {
    throw new Error("Synthoz rejected the API key - check SYNTHOZ_API_KEY on the deployment.");
  }

  if (!res.ok) {
    throw new Error(`Synthoz ${action} failed (${res.status}): ${text.slice(0, 200)}`);
  }

  // { state: false } is Synthoz's synchronous ACK for ASYNC tools (find-emails,
  // convert-company-names). It means "request queued - result incoming via
  // outgoing webhook." It is NOT a failure. Record the correlation job NOW so the
  // webhook delivery is attributed to this user, then signal the caller to show
  // "processing" instead of results.
  if (data && typeof data === "object" && (data as { state?: unknown }).state === false) {
    if (ctx?.userId) {
      await recordSynthozJob(ctx.userId, action, {
        domain: typeof payload.domain === "string" ? payload.domain : undefined,
        url: typeof payload.url === "string" ? payload.url : undefined,
        company: typeof payload.company_name === "string" ? payload.company_name : undefined,
      });
    }
    throw new SynthozQueuedError();
  }

  // Sync result received. Stamp a job for completeness (webhook may still fire).
  if (ctx?.userId) {
    await recordSynthozJob(ctx.userId, action, {
      domain: typeof payload.domain === "string" ? payload.domain : undefined,
      url: typeof payload.url === "string" ? payload.url : undefined,
      company: typeof payload.company_name === "string" ? payload.company_name : undefined,
    });
  }

  return data;
}

/** Enrich a company by domain → company data + contacts. */
export function enrichCompany(domain: string, ctx?: SynthozCtx) {
  return call("enrich-company", { domain }, ctx);
}

/** Turn a company name into enriched company records. */
export function convertCompanyNames(companyName: string, ctx?: SynthozCtx) {
  return call("convert-company-names", { company_name: companyName }, ctx);
}

/** Extract emails / phones / socials from a website URL. */
export function extractEmailsFromUrls(url: string, ctx?: SynthozCtx) {
  return call("extract-emails-from-urls", { url }, ctx);
}

/** Find an email from first + last name and a company domain. */
export function findEmailsFirstLast(
  firstName: string,
  lastName: string,
  domain: string,
  ctx?: SynthozCtx
) {
  return call("find-emails-first-last", {
    first_name: firstName,
    last_name: lastName,
    domain,
  }, ctx);
}
