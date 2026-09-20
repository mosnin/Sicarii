// Findymail email finder (secondary in the waterfall).
//
// You own the returned data ("You own and retain all rights to the Customer
// Data") and there's no explicit resale ban, but resale permission is by silence
// and gated behind a non-public AUP - GET IT IN WRITING before relying on resale.
// Env-gated and dormant until FINDYMAIL_API_KEY is set.
//
// NOTE: confirm the exact endpoint + response shape against Findymail's API docs
// before enabling in production.
import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://app.findymail.com/api";

export function isFindymailConfigured(): boolean {
  return Boolean(process.env.FINDYMAIL_API_KEY?.trim());
}

export async function findymailFind(input: { name: string; domain: string }): Promise<string | null> {
  const key = process.env.FINDYMAIL_API_KEY?.trim();
  if (!key) return null;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE}/search/name`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name: input.name, domain: input.domain }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as
    | { contact?: { email?: string }; email?: string }
    | null;
  const email = data?.contact?.email ?? data?.email;
  return typeof email === "string" && email.includes("@") ? email.toLowerCase().trim() : null;
}
