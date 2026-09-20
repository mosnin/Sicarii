// Anymailfinder email finder.
//
// RESALE-SAFE: their Acceptable Use Policy permits reselling found emails as
// part of your own product ("Customers may resell or provide email data ... as
// part of their own product or service"). Conditions: keep it B2B, comply with
// anti-spam law, do not name Anymailfinder as the source. Env-gated.
//
// NOTE: confirm the exact v5 endpoint + response shape against the live
// Anymailfinder API docs before enabling in production (this stays dormant until
// ANYMAILFINDER_API_KEY is set).
import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://api.anymailfinder.com";

export function isAnymailfinderConfigured(): boolean {
  return Boolean(process.env.ANYMAILFINDER_API_KEY?.trim());
}

export async function anymailfinderFind(input: { fullName: string; domain: string }): Promise<string | null> {
  const key = process.env.ANYMAILFINDER_API_KEY?.trim();
  if (!key) return null;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE}/v5.0/search/person.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: input.fullName, domain: input.domain }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null; // 404/451 = not found / not deliverable
  const data = (await res.json().catch(() => null)) as
    | { results?: { email?: string }; email?: string }
    | null;
  const email = data?.results?.email ?? data?.email;
  return typeof email === "string" && email.includes("@") ? email.toLowerCase().trim() : null;
}
