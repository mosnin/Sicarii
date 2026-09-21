// DNS posture check for a sending domain. Real lookups via Node's resolver,
// so a "verified" flag in the UI always means the record actually resolves
// right now, never "we told the registrar to add it". Pure functions take
// the resolved records so the verdict logic is unit-testable without DNS.

import { promises as dns } from "dns";

export interface DnsPosture {
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  mxOk: boolean;
  /** Human-readable findings, one per record, for the UI. */
  findings: string[];
}

export interface DnsSnapshot {
  txt: string[]; // TXT records at the apex, each joined
  mx: { exchange: string; priority: number }[];
  dmarcTxt: string[]; // TXT at _dmarc.<domain>
  dkimTxt: string[]; // TXT at <selector>._domainkey.<domain> (empty when no selector)
  dkimSelector?: string | null;
}

export function evaluatePosture(snap: DnsSnapshot): DnsPosture {
  const findings: string[] = [];

  const spf = snap.txt.find((t) => /^v=spf1\b/i.test(t.trim()));
  const spfOk = Boolean(spf && !/\+all\b/i.test(spf));
  if (!spf) findings.push("No SPF record (TXT starting with v=spf1).");
  else if (/\+all\b/i.test(spf)) findings.push("SPF ends in +all, which lets anyone send as you. Use ~all or -all.");
  else findings.push(`SPF: ${spf}`);

  const dmarc = snap.dmarcTxt.find((t) => /^v=DMARC1\b/i.test(t.trim()));
  const dmarcOk = Boolean(dmarc);
  if (!dmarc) findings.push("No DMARC record at _dmarc (TXT starting with v=DMARC1). Start with p=none.");
  else findings.push(`DMARC: ${dmarc}`);

  let dkimOk = false;
  if (!snap.dkimSelector) {
    findings.push("DKIM not checked: no selector known for this domain yet.");
  } else {
    const dkim = snap.dkimTxt.find((t) => /(^|;)\s*p=/i.test(t));
    dkimOk = Boolean(dkim);
    findings.push(
      dkimOk
        ? `DKIM: selector ${snap.dkimSelector} publishes a key.`
        : `No DKIM key at ${snap.dkimSelector}._domainkey.`,
    );
  }

  const mxOk = snap.mx.length > 0;
  findings.push(mxOk ? `MX: ${snap.mx.map((m) => m.exchange).join(", ")}` : "No MX records: this domain cannot receive replies.");

  return { spfOk, dkimOk, dmarcOk, mxOk, findings };
}

async function txt(name: string): Promise<string[]> {
  try {
    const rows = await dns.resolveTxt(name);
    return rows.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

export async function snapshotDns(domain: string, dkimSelector?: string | null): Promise<DnsSnapshot> {
  const d = domain.trim().toLowerCase();
  const [apexTxt, dmarcTxt, dkimTxt, mx] = await Promise.all([
    txt(d),
    txt(`_dmarc.${d}`),
    dkimSelector ? txt(`${dkimSelector}._domainkey.${d}`) : Promise.resolve([]),
    dns.resolveMx(d).catch(() => [] as { exchange: string; priority: number }[]),
  ]);
  return { txt: apexTxt, mx, dmarcTxt, dkimTxt, dkimSelector: dkimSelector ?? null };
}

export async function checkDomainDns(domain: string, dkimSelector?: string | null): Promise<DnsPosture> {
  return evaluatePosture(await snapshotDns(domain, dkimSelector));
}

/** Strict enough to keep junk out of the registrar and DNS calls. */
export function isValidDomain(input: string): boolean {
  const d = input.trim().toLowerCase();
  if (d.length < 4 || d.length > 253) return false;
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d)) return false;
  return true;
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}
