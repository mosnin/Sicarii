// Email finder -> verifier waterfall (resale-safe providers).
//
// Tries finders in order (Anymailfinder, then Findymail), stops at the first
// candidate that sits on the company domain, then runs ONE verification pass
// (Bouncer) and accepts only a deliverable, non-catch-all address. Returns null
// on no candidate or a failed verification, so the caller never charges and
// never attaches a junk address. Fully env-gated: with no provider keys this is
// a no-op and callers fall through to their existing providers.
import { anymailfinderFind, isAnymailfinderConfigured } from "@/lib/providers/anymailfinder";
import { findymailFind, isFindymailConfigured } from "@/lib/providers/findymail";
import { bouncerVerify, isBouncerConfigured } from "@/lib/providers/bouncer";

export function isEmailWaterfallConfigured(): boolean {
  return isAnymailfinderConfigured() || isFindymailConfigured();
}

export interface WaterfallEmail {
  email: string;
  via: string; // the finder that supplied it
  verified: boolean; // passed Bouncer deliverability
}

function emailAtDomain(email: string, domain: string): boolean {
  const d = email.split("@")[1]?.toLowerCase();
  return Boolean(d && (d === domain || d.endsWith(`.${domain}`)));
}

export async function findVerifiedEmail(input: {
  fullName: string;
  domain: string;
}): Promise<WaterfallEmail | null> {
  const finders: { slug: string; run: () => Promise<string | null> }[] = [];
  if (isAnymailfinderConfigured())
    finders.push({ slug: "anymailfinder", run: () => anymailfinderFind(input) });
  if (isFindymailConfigured())
    finders.push({
      slug: "findymail",
      run: () => findymailFind({ name: input.fullName, domain: input.domain }),
    });

  for (const finder of finders) {
    let email: string | null = null;
    try {
      email = await finder.run();
    } catch {
      email = null;
    }
    if (!email || !emailAtDomain(email, input.domain)) continue;

    if (isBouncerConfigured()) {
      const verdict = await bouncerVerify(email).catch(() => "unknown" as const);
      if (verdict !== "deliverable") continue; // reject catch-all / risky / undeliverable
      return { email, via: finder.slug, verified: true };
    }
    // No verifier configured: accept the finder result unverified.
    return { email, via: finder.slug, verified: false };
  }
  return null;
}
