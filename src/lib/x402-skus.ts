// On-demand usage SKUs for x402. A subscription is an included monthly
// allowance on the same credit meter. When that meter is empty (or the
// account never subscribed), an agent pays for one call or one contact
// instead of buying a plan.
//
// Paying a SKU grants credits. The original tool still spends only on a hit
// (never a miss), so a failed lookup leaves the purchased credits on the meter.

import { CREDIT_COSTS, MAX_CREDIT_GRANT, type CreditAction } from "@/lib/credits";
import { OpError } from "@/lib/op-error";
import { USD_PER_CREDIT } from "@/lib/x402";

export const MIN_PACK_CREDITS = 100;
export const MAX_PACK_CREDITS = MAX_CREDIT_GRANT;
export const DEFAULT_PACK_CREDITS = 1_000;
export const MIN_SKU_QUANTITY = 1;
export const MAX_SKU_QUANTITY = 500;
export const SKU_ID_RE = /^[a-z][a-z0-9_]{0,62}$/;

export type SkuKind = "action" | "contact" | "pack";

export type UsageSku = {
  id: string;
  kind: SkuKind;
  credits: number;
  label: string;
  description: string;
};

const ACTION_LABELS: Record<CreditAction, { label: string; description: string }> = {
  web_search: { label: "Web search", description: "One paid web search" },
  linkedin: { label: "LinkedIn", description: "Find a verified LinkedIn for one person" },
  email: { label: "Work email", description: "Find a verified work email for one person" },
  phone: { label: "Phone", description: "Find a verified phone for one person" },
  find_companies: { label: "Find companies", description: "One prompt-to-companies discovery run" },
  maps_leads: { label: "Maps leads", description: "One local-business discovery run" },
  contact_extract: { label: "Extract contacts", description: "Pull contacts from one site" },
  serp_search: { label: "SERP search", description: "One Google search plus scrape" },
  find_socials: { label: "Find socials", description: "Find social profiles for one person" },
  deep_report: { label: "Deep report", description: "One sourced company report" },
  analyze_site: { label: "Analyze site", description: "Read and summarize one website" },
  company_aspect: { label: "Company aspect", description: "Enrich one company aspect" },
  deep_research: { label: "Deep research", description: "One scheduled research run" },
  monitor_run: { label: "Monitor run", description: "One intent-monitor pass" },
  breakup_draft: { label: "Breakup draft", description: "Draft one stalled-deal breakup email" },
  build_segment: { label: "Smart segment", description: "Build one prompt-matched segment" },
  remember: { label: "Remember", description: "Persist one memory note" },
};

export const CONTACT_SKUS = {
  contact: {
    id: "contact",
    kind: "contact" as const,
    credits: CREDIT_COSTS.linkedin + CREDIT_COSTS.email,
    label: "Contact",
    description: "One person: LinkedIn plus work email. Enough credits to enrich, spent only if the lookup hits.",
  },
  contact_full: {
    id: "contact_full",
    kind: "contact" as const,
    credits: CREDIT_COSTS.linkedin + CREDIT_COSTS.email + CREDIT_COSTS.phone,
    label: "Contact plus phone",
    description: "One person: LinkedIn, work email, and phone. Spent only if the lookup hits.",
  },
} satisfies Record<string, UsageSku>;

export function actionSkus(): UsageSku[] {
  return (Object.keys(CREDIT_COSTS) as CreditAction[]).map((id) => ({
    id,
    kind: "action" as const,
    credits: CREDIT_COSTS[id],
    label: ACTION_LABELS[id].label,
    description: ACTION_LABELS[id].description,
  }));
}

export function listUsageSkus(): UsageSku[] {
  return [...Object.values(CONTACT_SKUS), ...actionSkus()];
}

export function findSku(id: string): UsageSku | null {
  // Object.hasOwn, not `in`: `__proto__` / `constructor` are inherited and
  // must never resolve as a payable sku.
  if (!SKU_ID_RE.test(id)) return null;
  if (Object.hasOwn(CONTACT_SKUS, id)) return CONTACT_SKUS[id as keyof typeof CONTACT_SKUS];
  if (Object.hasOwn(CREDIT_COSTS, id)) {
    const action = id as CreditAction;
    return {
      id: action,
      kind: "action",
      credits: CREDIT_COSTS[action],
      label: ACTION_LABELS[action].label,
      description: ACTION_LABELS[action].description,
    };
  }
  return null;
}

export function creditsToUsd(credits: number): number {
  return Math.round(credits * USD_PER_CREDIT * 100) / 100;
}

export type ResolvedSku = {
  sku: UsageSku;
  quantity: number;
  credits: number;
  priceUsd: number;
};

export function resolveSku(id: string, quantity = 1): ResolvedSku {
  const sku = findSku(id);
  if (!sku) throw new OpError(`Unknown usage sku: ${id}`, 400);
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty < MIN_SKU_QUANTITY || qty > MAX_SKU_QUANTITY) {
    throw new OpError(
      `quantity must be between ${MIN_SKU_QUANTITY} and ${MAX_SKU_QUANTITY}`,
      400,
    );
  }
  const credits = sku.credits * qty;
  if (credits > MAX_PACK_CREDITS) {
    throw new OpError(`That purchase is too large (max ${MAX_PACK_CREDITS} credits)`, 400);
  }
  return { sku, quantity: qty, credits, priceUsd: creditsToUsd(credits) };
}

export function usageModelCopy() {
  return {
    meter: "One credit meter. A plan includes a monthly allowance. Extra usage is purchased credits or a per-call x402 payment.",
    noSubscription:
      "A subscription is optional. Agents can pay for one contact or one data call with USDC over x402.",
    missPolicy:
      "Purchased credits sit on the meter. The original tool still spends only when a lookup returns data.",
  };
}
