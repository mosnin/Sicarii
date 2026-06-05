// Synthoz enrichment API client.
//
// Request shapes are taken from the Synthoz dashboard ("USE THE API" panels):
// every call POSTs JSON containing `api_key` plus action-specific fields to
//   https://myapiconnect.com/api-product/incoming-webhook/<action>
//
// The response shapes are not yet documented to us, so callers store the raw
// JSON (e.g. on `entity.enrichment`) and extraction is refined once we see real
// responses. The API key is read from SYNTHOZ_API_KEY (set on the deployment).

const BASE = "https://myapiconnect.com/api-product/incoming-webhook";

export class SynthozNotConfiguredError extends Error {
  constructor() {
    super("SYNTHOZ_API_KEY is not set");
    this.name = "SynthozNotConfiguredError";
  }
}

export function isSynthozConfigured(): boolean {
  return Boolean(process.env.SYNTHOZ_API_KEY?.trim());
}

async function call(action: string, payload: Record<string, unknown>) {
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
  // Each Synthoz product meters separately — a tool can report "not enough
  // credits" even when the key is valid and other tools work.
  if (/not enough credit|insufficient credit|out of credit|no credits?\b|credit limit/.test(flat)) {
    throw new Error(
      `Synthoz: not enough credits for this tool (${action}). This product draws from a separate Synthoz credit pool than enrichment — top up or enable it in your Synthoz account.`
    );
  }

  if (!res.ok) {
    throw new Error(
      `Synthoz ${action} failed (${res.status}): ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }
  return data;
}

/** Enrich a company by domain → company data + contacts. */
export function enrichCompany(domain: string) {
  return call("enrich-company", { domain });
}

/** Turn a company name into enriched company records. */
export function convertCompanyNames(companyName: string) {
  return call("convert-company-names", { company_name: companyName });
}

/** Extract emails / phones / socials from a website URL. */
export function extractEmailsFromUrls(url: string) {
  return call("extract-emails-from-urls", { url });
}

/** Find an email from first + last name and a company domain. */
export function findEmailsFirstLast(
  firstName: string,
  lastName: string,
  domain: string
) {
  return call("find-emails-first-last", {
    first_name: firstName,
    last_name: lastName,
    domain,
  });
}
