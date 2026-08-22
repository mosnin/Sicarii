// Bouncer email verifier.
//
// RESALE-SAFE via Bouncer's Agency/Reseller Partner Program (verify the program
// terms cover your redistribution). We run a single verification pass after the
// finders and accept ONLY deliverable, non-catch-all addresses. Env-gated.
//
// NOTE: confirm the exact endpoint + response shape against Bouncer's API docs
// before enabling in production (dormant until BOUNCER_API_KEY is set).
import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://api.usebouncer.com/v1.1";

export function isBouncerConfigured(): boolean {
  return Boolean(process.env.BOUNCER_API_KEY?.trim());
}

export type EmailVerdict = "deliverable" | "risky" | "undeliverable" | "unknown";

export async function bouncerVerify(email: string): Promise<EmailVerdict> {
  const key = process.env.BOUNCER_API_KEY?.trim();
  if (!key) return "unknown";
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${BASE}/email/verify?email=${encodeURIComponent(email)}&timeout=10`,
      { headers: { "x-api-key": key, Accept: "application/json" } },
    );
  } catch {
    return "unknown";
  }
  if (!res.ok) return "unknown";
  const data = (await res.json().catch(() => null)) as
    | { status?: string; domain?: { acceptAll?: string } }
    | null;
  const status = data?.status;
  // Treat a catch-all (accept-all) domain as risky even if marked deliverable,
  // so it routes to the reject branch rather than into a sequence.
  if (status === "deliverable" && data?.domain?.acceptAll === "yes") return "risky";
  if (status === "deliverable" || status === "risky" || status === "undeliverable") return status;
  return "unknown";
}
