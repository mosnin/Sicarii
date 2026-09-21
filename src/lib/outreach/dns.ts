// DNS authentication records for sending domains (Card 0015).
//
// Cold email lives or dies on SPF/DKIM/DMARC. This module builds the exact
// records each provider needs and verifies them through DNS-over-HTTPS, so a
// domain is never marked "verified" on our say-so — only on what the internet
// actually resolves. Pure functions (builders) are unit-tested; verification
// hits dns.google / cloudflare-dns.com over HTTPS (no raw DNS sockets, no
// SSRF surface beyond two allowlisted hosts).

import { fetchWithTimeout } from "@/lib/http";

export interface DnsRecord {
  type: "TXT" | "CNAME" | "MX";
  host: string; // "@" for apex, or the subdomain label
  value: string;
  ttl?: number;
}

export interface DnsChecklist {
  spf: DnsRecord;
  dkim: DnsRecord[];
  dmarc: DnsRecord;
}

export interface DnsVerification {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  /** "none" | "quarantine" | "reject" | null — the enforced DMARC policy. */
  dmarcPolicy: "none" | "quarantine" | "reject" | null;
  checkedAt: string;
  detail: string[];
}

const DOH_HOSTS = [
  "https://dns.google/resolve",
  "https://cloudflare-dns.com/dns-query",
] as const;

/**
 * SPF record for a domain. `include` is the provider's SPF include:
 * - Google Workspace mailboxes: "_spf.google.com"
 * - Bird shared/dedicated sending: provider-supplied (passed in once known)
 * Multiple sending paths are comma-joined into ONE TXT record — publishing
 * two SPF records is a hard fail (permerror) at receivers.
 */
export function buildSpfRecord(includes: string[]): DnsRecord {
  const mechanisms = includes.map((i) => `include:${i.trim()}`).join(" ");
  return { type: "TXT", host: "@", value: `v=spf1 ${mechanisms} ~all` };
}

/**
 * DKIM CNAME record. Google Workspace uses `google._domainkey` ->
 * `google._domainkey.<domainkey-target>`; Bird publishes a per-domain DKIM
 * selector + target from its verify-domain response. The `target` here is the
 * full provider hostname (not yet known until the provider issues it, so the
 * caller fills it from the Bird/Google response and re-renders).
 */
export function buildDkimRecord(selector: string, target: string): DnsRecord {
  return { type: "CNAME", host: `${selector}._domainkey`, value: target };
}

/**
 * DMARC record. New cold domains start at `p=none` (observe) so legitimate
 * warmup mail is never quarantined by our own policy; the operator tightens
 * to `quarantine`/`reject` once placement is clean. rua mailbox defaults to
 * postmaster@ unless the caller passes a monitored address.
 */
export function buildDmarcRecord(
  policy: "none" | "quarantine" | "reject" = "none",
  rua?: string,
): DnsRecord {
  const ruaPart = rua ? ` rua=mailto:${rua};` : "";
  return {
    type: "TXT",
    host: "_dmarc",
    value: `v=DMARC1; p=${policy};${ruaPart} fo=1; adkim=r; aspf=r;`,
  };
}

/** Full checklist for a PremiumInboxes Google-Workspace mailbox domain. */
export function googleWorkspaceChecklist(domain: string, dkimTarget: string): DnsChecklist {
  void domain;
  return {
    spf: buildSpfRecord(["_spf.google.com"]),
    dkim: [buildDkimRecord("google", dkimTarget)],
    dmarc: buildDmarcRecord(),
  };
}

/** Full checklist for a Bird-verified sending domain. */
export function birdChecklist(
  dkimSelector: string,
  dkimTarget: string,
  returnPathCname: string,
  spfIncludes: string[] = [],
): DnsChecklist {
  // Bird's return-path CNAME covers SPF alignment, so extra includes are
  // only needed when the same domain also sends elsewhere (e.g. Workspace).
  const spf =
    spfIncludes.length > 0
      ? buildSpfRecord(spfIncludes)
      : { type: "TXT" as const, host: "@", value: "v=spf1 ~all" };
  return {
    spf,
    dkim: [
      buildDkimRecord(dkimSelector, dkimTarget),
      { type: "CNAME", host: "em", value: returnPathCname },
    ],
    dmarc: buildDmarcRecord(),
  };
}

interface DohAnswer {
  data?: string;
}
interface DohResponse {
  Answer?: DohAnswer[];
}

async function dohQuery(name: string, type: "TXT" | "CNAME"): Promise<string[]> {
  for (const base of DOH_HOSTS) {
    try {
      const url =
        base === DOH_HOSTS[0]
          ? `${base}?name=${encodeURIComponent(name)}&type=${type}`
          : `${base}?name=${encodeURIComponent(name)}&type=${type}`;
      const res = await fetchWithTimeout(
        url,
        base === DOH_HOSTS[1]
          ? { headers: { accept: "application/dns-json" } }
          : undefined,
        10_000,
      );
      if (!res.ok) continue;
      const json = (await res.json()) as DohResponse;
      const answers = Array.isArray(json.Answer) ? json.Answer : [];
      const out: string[] = [];
      for (const a of answers) {
        if (typeof a.data === "string") out.push(a.data.replace(/^"|"$/g, ""));
      }
      if (out.length > 0 || res.ok) return out;
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Verify a domain's authentication posture against live DNS. Returns per-check
 * booleans plus the enforced DMARC policy. Never throws — an unreachable DoH
 * endpoint degrades to all-false with a detail line, so verification is honest
 * about what it could actually resolve.
 */
export async function verifyDomainDns(
  domain: string,
  opts: { dkimSelector?: string } = {},
): Promise<DnsVerification> {
  const detail: string[] = [];
  let spf = false;
  let dkim = false;
  let dmarcPolicy: DnsVerification["dmarcPolicy"] = null;

  const txt = await dohQuery(domain, "TXT");
  const spfRecord = txt.find((t) => t.startsWith("v=spf1"));
  if (spfRecord) {
    spf = true;
    detail.push(`SPF present (${spfRecord.slice(0, 80)})`);
  } else {
    detail.push("No SPF record at apex");
  }

  const selector = opts.dkimSelector ?? "google";
  const dkimAnswers = await dohQuery(`${selector}._domainkey.${domain}`, "CNAME");
  const dkimTxt = dkimAnswers.length === 0 ? await dohQuery(`${selector}._domainkey.${domain}`, "TXT") : [];
  if (dkimAnswers.length > 0 || dkimTxt.some((t) => t.includes("v=DKIM1") || t.includes("k=rsa"))) {
    dkim = true;
    detail.push(`DKIM selector ${selector} resolves`);
  } else {
    detail.push(`DKIM selector ${selector} missing`);
  }

  const dmarcTxt = await dohQuery(`_dmarc.${domain}`, "TXT");
  const dmarcRecord = dmarcTxt.find((t) => t.startsWith("v=DMARC1"));
  if (dmarcRecord) {
    const m = dmarcRecord.match(/p\s*=\s*(none|quarantine|reject)/i);
    dmarcPolicy = m ? (m[1].toLowerCase() as DnsVerification["dmarcPolicy"]) : null;
    detail.push(`DMARC present (p=${dmarcPolicy ?? "unparseable"})`);
  } else {
    detail.push("No DMARC record");
  }

  return {
    spf,
    dkim,
    dmarc: dmarcPolicy !== null,
    dmarcPolicy,
    checkedAt: new Date().toISOString(),
    detail,
  };
}

/** A domain may carry cold volume only when all three checks pass. */
export function isDnsReady(v: DnsVerification): boolean {
  return v.spf && v.dkim && v.dmarc;
}
