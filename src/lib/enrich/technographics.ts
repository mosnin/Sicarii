// Self-derived technographics: detect the technologies a company's website uses
// by fingerprinting its already-public HTML + response headers. Zero marginal
// cost and NO third-party data licence (it's our own derived data, so fully
// resale-safe). We write our own fingerprints for the technologies that matter
// rather than bundle the community ruleset (which is GPL-3.0 / copyleft).
import { Prisma } from "@prisma/client";
import { fetchWithTimeout } from "@/lib/http";
import { safeHttpUrl, resolvesToPublicIp } from "@/lib/ssrf";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";
import { recordProvenance, CONFIDENCE } from "@/lib/provenance";

type Fingerprint = {
  name: string;
  category: string;
  html?: RegExp[]; // matched against the page HTML
  headers?: { name: string; re: RegExp }[]; // matched against response headers
};

const FINGERPRINTS: Fingerprint[] = [
  // Ecommerce / CMS
  { name: "Shopify", category: "Ecommerce", html: [/cdn\.shopify\.com/i], headers: [{ name: "x-shopid", re: /.+/ }, { name: "x-shopify-stage", re: /.+/ }] },
  { name: "WooCommerce", category: "Ecommerce", html: [/woocommerce/i, /wp-content\/plugins\/woocommerce/i] },
  { name: "Magento", category: "Ecommerce", html: [/\/static\/version\d+\/frontend/i, /Magento_/] },
  { name: "BigCommerce", category: "Ecommerce", html: [/cdn\d*\.bigcommerce\.com/i] },
  { name: "Squarespace", category: "CMS", html: [/static\d*\.squarespace\.com/i] },
  { name: "Wix", category: "CMS", html: [/static\.wixstatic\.com/i] },
  { name: "Webflow", category: "CMS", html: [/assets-global\.website-files\.com/i, /webflow\.js/i] },
  { name: "WordPress", category: "CMS", html: [/wp-content\//i, /wp-includes\//i] },
  { name: "Framer", category: "CMS", html: [/framerusercontent\.com/i] },
  // Marketing / CRM / support
  { name: "HubSpot", category: "Marketing", html: [/js\.hs-scripts\.com/i, /hs-analytics/i] },
  { name: "Marketo", category: "Marketing", html: [/munchkin\.marketo\.net/i] },
  { name: "Pardot", category: "Marketing", html: [/pi\.pardot\.com/i] },
  { name: "Klaviyo", category: "Marketing", html: [/static\.klaviyo\.com/i] },
  { name: "Mailchimp", category: "Marketing", html: [/chimpstatic\.com/i] },
  { name: "Salesforce", category: "CRM", html: [/\.force\.com/i, /salesforce\.com\//i] },
  { name: "Intercom", category: "Support", html: [/widget\.intercom\.io/i, /intercomcdn/i] },
  { name: "Drift", category: "Support", html: [/js\.driftt\.com/i] },
  { name: "Zendesk", category: "Support", html: [/static\.zdassets\.com/i] },
  // Analytics
  { name: "Google Analytics", category: "Analytics", html: [/google-analytics\.com\/analytics\.js/i, /gtag\/js\?id=ua-/i] },
  { name: "Google Analytics 4", category: "Analytics", html: [/gtag\/js\?id=g-/i] },
  { name: "Google Tag Manager", category: "Analytics", html: [/googletagmanager\.com\/gtm\.js/i] },
  { name: "Segment", category: "Analytics", html: [/cdn\.segment\.com\/analytics\.js/i] },
  { name: "Mixpanel", category: "Analytics", html: [/cdn\.mxpnl\.com/i] },
  { name: "Amplitude", category: "Analytics", html: [/cdn\.amplitude\.com/i] },
  { name: "Hotjar", category: "Analytics", html: [/static\.hotjar\.com/i] },
  { name: "Meta Pixel", category: "Analytics", html: [/connect\.facebook\.net\/[^"']*\/fbevents\.js/i] },
  // Payments
  { name: "Stripe", category: "Payments", html: [/js\.stripe\.com/i] },
  { name: "PayPal", category: "Payments", html: [/paypal\.com\/sdk\/js/i, /paypalobjects\.com/i] },
  // Frameworks / infra
  { name: "Next.js", category: "Framework", html: [/\/_next\/static\//i, /__NEXT_DATA__/], headers: [{ name: "x-powered-by", re: /next\.js/i }] },
  { name: "React", category: "Framework", html: [/data-reactroot/i] },
  { name: "Vue.js", category: "Framework", html: [/data-v-[0-9a-f]{8}/i] },
  { name: "Angular", category: "Framework", html: [/ng-version=/i] },
  { name: "Tailwind CSS", category: "Framework", html: [/tailwindcss/i] },
  { name: "Cloudflare", category: "Infra", headers: [{ name: "server", re: /cloudflare/i }, { name: "cf-ray", re: /.+/ }] },
  { name: "Vercel", category: "Infra", headers: [{ name: "x-vercel-id", re: /.+/ }] },
  { name: "Netlify", category: "Infra", headers: [{ name: "x-nf-request-id", re: /.+/ }] },
  // Scheduling / forms
  { name: "Calendly", category: "Scheduling", html: [/assets\.calendly\.com/i] },
  { name: "Typeform", category: "Forms", html: [/embed\.typeform\.com/i] },
];

export interface DetectedTech {
  name: string;
  category: string;
}

export function detectTech(html: string, headers?: Record<string, string>): DetectedTech[] {
  const hdrs = headers ?? {};
  const found: DetectedTech[] = [];
  for (const fp of FINGERPRINTS) {
    const htmlHit = fp.html?.some((re) => re.test(html)) ?? false;
    const headerHit =
      fp.headers?.some((h) => {
        const v = hdrs[h.name.toLowerCase()];
        return v != null && h.re.test(v);
      }) ?? false;
    if (htmlHit || headerHit) found.push({ name: fp.name, category: fp.category });
  }
  return found;
}

/** Fetch a site's homepage and detect its tech stack. Returns [] on any error.
 *  SSRF-guarded: the URL is agent-writable (update_entity.website), so it must
 *  be a public HTTPS host - never an internal address probe. */
export async function detectSiteTech(url: string): Promise<DetectedTech[]> {
  const target = safeHttpUrl(url.startsWith("http") ? url : `https://${url}`);
  if (!target || !(await resolvesToPublicIp(target.hostname).catch(() => false))) {
    return [];
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(
      target.toString(),
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; ScalarBot/1.0; +https://tryscalar.xyz)" } },
      15_000,
    );
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const html = (await res.text().catch(() => "")).slice(0, 500_000);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return detectTech(html, headers);
}

/** Detect and store an entity's tech stack under enrichment.tech. Free. */
export async function detectEntityTech(userId: string, entityId: string) {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity || entity.userId !== userId) throw new OpError("Entity not found", 404);
  const url = entity.website || entity.domain;
  if (!url) throw new OpError("Entity has no website or domain to analyze.", 400);

  const tech = await detectSiteTech(url);
  if (tech.length === 0) {
    return { id: entity.id, name: entity.name, tech: [] as DetectedTech[] };
  }

  const existing =
    entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
      ? (entity.enrichment as Record<string, unknown>)
      : {};
  const updated = await prisma.entity.update({
    where: { id: entityId },
    data: { enrichment: { ...existing, tech } as unknown as Prisma.InputJsonValue },
  });
  await recordProvenance({
    recordType: "entity",
    recordId: entityId,
    field: "tech",
    source: "derived",
    confidence: CONFIDENCE.derived,
    value: tech.map((t) => t.name).join(", "),
  });
  return { id: updated.id, name: updated.name, tech };
}
