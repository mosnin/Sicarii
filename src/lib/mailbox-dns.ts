// Real DNS lookups for sending-domain posture. SPF must not be +all.
// We store flags plus the records an operator should add. Missing SPF,
// DKIM, or DMARC lowers health; +all or missing MX is a hard stop.

import { promises as dns } from "node:dns";

export type RecommendedDnsRecord = {
  type: "TXT" | "MX" | "CNAME";
  host: string;
  value: string;
  why: string;
};

export type DnsPosture = {
  domain: string;
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  mxOk: boolean;
  spfPlusAll: boolean;
  hardStop: boolean;
  hardStopReason: "spf_plus_all" | "mx_missing" | null;
  records: RecommendedDnsRecord[];
  checkedAt: Date;
};

const COMMON_DKIM_SELECTORS = [
  "default",
  "google",
  "selector1",
  "selector2",
  "k1",
  "s1",
  "s2",
  "fm1",
  "fm2",
  "fm3",
];

function flattenTxt(chunks: string[][]): string[] {
  return chunks.map((row) => row.join(""));
}

export function parseSpf(txtRecords: string[]): { found: boolean; plusAll: boolean; raw: string | null } {
  const spf = txtRecords.find((row) => /v=spf1/i.test(row)) ?? null;
  if (!spf) return { found: false, plusAll: false, raw: null };
  const plusAll = /\s\+all\s*$/i.test(spf.trim()) || /\s\+all\s/i.test(spf);
  return { found: true, plusAll, raw: spf };
}

export function parseDmarc(txtRecords: string[]): boolean {
  return txtRecords.some((row) => /v=dmarc1/i.test(row));
}

export function parseDkim(txtRecords: string[]): boolean {
  return txtRecords.some((row) => /v=dkim1/i.test(row) || /k=rsa/i.test(row) || /p=[A-Za-z0-9+/]/i.test(row));
}

function recommendedFor(domain: string, posture: Omit<DnsPosture, "records" | "checkedAt" | "domain">): RecommendedDnsRecord[] {
  const records: RecommendedDnsRecord[] = [];
  if (!posture.spfOk || posture.spfPlusAll) {
    records.push({
      type: "TXT",
      host: domain,
      value: "v=spf1 include:_spf.google.com ~all",
      why: posture.spfPlusAll
        ? "SPF currently ends with +all. Replace it with ~all or -all."
        : "Add an SPF record that does not end with +all.",
    });
  }
  if (!posture.dkimOk) {
    records.push({
      type: "TXT",
      host: `google._domainkey.${domain}`,
      value: "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY",
      why: "Publish a DKIM selector (google, selector1, or your provider's).",
    });
  }
  if (!posture.dmarcOk) {
    records.push({
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      why: "Add a DMARC policy at _dmarc so receivers know what to do with fails.",
    });
  }
  if (!posture.mxOk) {
    records.push({
      type: "MX",
      host: domain,
      value: "1 smtp.google.com",
      why: "This domain has no MX. Inbound and many providers will reject mail.",
    });
  }
  return records;
}

async function resolveTxtSafe(name: string): Promise<string[]> {
  try {
    return flattenTxt(await dns.resolveTxt(name));
  } catch {
    return [];
  }
}

async function resolveMxSafe(name: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(name);
    return mx.length > 0;
  } catch {
    return false;
  }
}

export async function inspectDomainDns(name: string): Promise<DnsPosture> {
  const domain = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const [apexTxt, dmarcTxt, mxOk, ...dkimBatches] = await Promise.all([
    resolveTxtSafe(domain),
    resolveTxtSafe(`_dmarc.${domain}`),
    resolveMxSafe(domain),
    ...COMMON_DKIM_SELECTORS.map((sel) => resolveTxtSafe(`${sel}._domainkey.${domain}`)),
  ]);

  const spf = parseSpf(apexTxt);
  const dmarcOk = parseDmarc(dmarcTxt);
  const dkimOk = dkimBatches.some((batch) => parseDkim(batch));
  const spfPlusAll = Boolean(spf.found && spf.plusAll);
  const spfOk = Boolean(spf.found && !spf.plusAll);
  const hardStopReason: DnsPosture["hardStopReason"] = spfPlusAll ? "spf_plus_all" : mxOk ? null : "mx_missing";
  const flags: Omit<DnsPosture, "domain" | "records" | "checkedAt"> = {
    spfOk,
    dkimOk,
    dmarcOk,
    mxOk,
    spfPlusAll,
    hardStop: Boolean(hardStopReason),
    hardStopReason,
  };

  return {
    domain,
    ...flags,
    records: recommendedFor(domain, flags),
    checkedAt: new Date(),
  };
}

export function dnsHardStopEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.MAILBOX_DNS_HARD_STOP?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}
