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

  // Diagnostic — log the masked key fingerprint + Synthoz's raw response so
  // failures are inspectable in the deployment logs. The fingerprint lets you
  // confirm the DEPLOYED key is your real one (and not the docs' example key).
  const fp = `${apiKey.slice(0, 6)}…${apiKey.slice(-4)} (len ${apiKey.length})`;
  console.log(`[synthoz] ${action} key=${fp} → ${res.status}: ${text.slice(0, 600)}`);

  // Synthoz wraps failures in { state: false, event: "<message>" } (HTTP 200),
  // e.g. "You don't have anymore credits, please upgrade to use more." Surface
  // that message as an error instead of treating the envelope as a result.
  if (data && typeof data === "object" && (data as { state?: unknown }).state === false) {
    const event = (data as { event?: unknown }).event;
    throw new Error(`Synthoz: ${typeof event === "string" ? event : "request was rejected"}`);
  }

  // These webhook endpoints can return HTTP 200 with an error message body
  // (e.g. "no api key found") — detect auth failures regardless of status.
  const flat = (typeof data === "string" ? data : JSON.stringify(data ?? "")).toLowerCase();
  if (
    flat.includes("no api key") ||
    flat.includes("invalid api key") ||
    flat.includes("api key not") ||
    flat.includes("api_key not")
  ) {
    throw new Error(
      "Synthoz rejected the API key. Double-check the exact SYNTHOZ_API_KEY value on the deployment (no extra spaces, your real key — not the example from the docs)."
    );
  }
  // Surface Synthoz's own credit/billing response verbatim (same key works for
  // other tools, so this is account-side — show the exact message for support).
  if (/not enough credit|insufficient credit|out of credit|no credits?\b|credit limit/.test(flat)) {
    throw new Error(
      `Synthoz reported a credits error on "${action}". Its exact response: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  if (!res.ok) {
    throw new Error(
      `Synthoz ${action} failed (${res.status}): ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  // The call was accepted. Stamp a correlation job so the async result that
  // POSTs back to our webhook is attributed to this user. Keys come straight
  // from the request payload (domain / url / company_name).
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
