// Pipe0 enrichment client - 70+ pipes across 50+ data providers.
// Base: https://api.pipe0.com/v1  Auth: Authorization: Bearer KEY
// All calls use /pipes/run/sync for synchronous results.

const BASE = "https://api.pipe0.com/v1";

function key() {
  const k = process.env.PIPE0_API_KEY?.trim();
  if (!k) throw new Error("PIPE0_API_KEY is not set");
  return k;
}

export function isPipe0Configured() {
  return Boolean(process.env.PIPE0_API_KEY?.trim());
}

async function runPipe(pipeId: string, input: Record<string, string>, config?: Record<string, unknown>) {
  // Pipe0's /pipes/run/sync is a batch API: it runs a LIST of pipes over a LIST
  // of input records. We run one pipe over one record, so both are single-item
  // arrays. (Sending pipe_id + an input object 422s: "expected array ... at
  // pipes / at input".)
  const body = {
    pipes: [{ id: pipeId, ...(config ? { config } : {}) }],
    input: [input],
  };

  const res = await fetch(`${BASE}/pipes/run/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key()}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[pipe0] ${pipeId} → ${res.status}: ${text.slice(0, 400)}`);
  if (!res.ok) throw new Error(`Pipe0 ${pipeId} failed (${res.status}): ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as {
    status?: string;
    records?: unknown;
    results?: unknown;
    errors?: unknown[];
  };
  if (data.status === "failed") throw new Error(`Pipe0 ${pipeId} failed: ${JSON.stringify(data.errors ?? []).slice(0, 200)}`);
  // Return whatever holds the enriched rows; the caller deep-searches it.
  return data.records ?? data.results ?? data;
}

// Work email - waterfall across 50+ providers
export async function findWorkEmail(firstName: string, lastName: string, domain: string, companyName?: string) {
  return runPipe("people:workemail:waterfall@1", {
    first_name: firstName,
    last_name: lastName,
    company_domain: domain,
    ...(companyName ? { company_name: companyName } : {}),
  });
}

// Mobile phone number
export async function findMobile(firstName: string, lastName: string, domain: string, companyName?: string) {
  return runPipe("people:mobile", {
    first_name: firstName,
    last_name: lastName,
    company_domain: domain,
    ...(companyName ? { company_name: companyName } : {}),
  });
}

// Company news summary
export async function getCompanyNews(domain: string, companyName?: string) {
  return runPipe("company:news", {
    company_domain: domain,
    ...(companyName ? { company_name: companyName } : {}),
  });
}

// Company overview / description
export async function getCompanyOverview(domain: string) {
  return runPipe("company:overview@1", { company_domain: domain });
}

// Company tech stack via Pipe0
export async function getCompanyTechStackPipe0(domain: string) {
  return runPipe("company:techstack@1", { company_domain: domain });
}

// Company lookalikes via Pipe0
export async function getCompanyLookalikePipe0(domain: string) {
  return runPipe("company:lookalike", { company_domain: domain });
}

// Company funding via Pipe0
export async function getCompanyFundingPipe0(domain: string) {
  return runPipe("company:funding", { company_domain: domain });
}
