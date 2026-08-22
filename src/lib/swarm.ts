// Swarm discovery support: turning one broad goal into N distinct, blind search
// angles, and merging what each angle finds. Kept separate from crm-operations
// so the OpenAI angle-derivation call and the pure merge logic are independently
// testable without touching prisma/credits/exa at all.

import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import type { FoundCompany } from "@/lib/exa";

export const MIN_ANGLES = 2;
export const MAX_ANGLES = 6;
export const DEFAULT_ANGLES = 4;

const MODEL = process.env.OPENAI_SWARM_MODEL ?? "gpt-5-mini";

export function isAngleDerivationConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// Bound N so a swarm can never fan out into an unbounded (and unboundedly
// expensive) number of parallel paid searches.
export function clampAngleCount(n?: number): number {
  if (n == null || !Number.isFinite(n)) return DEFAULT_ANGLES;
  return Math.min(Math.max(Math.trunc(n), MIN_ANGLES), MAX_ANGLES);
}

/** Derive up to `n` distinct, complementary search angles from a broad
 *  discovery goal via a focused OpenAI call - e.g. "Series A devtools
 *  companies hiring platform engineers in the US" might split into
 *  sub-vertical, geography, hiring-signal, and funding-stage angles. Each
 *  angle must stand alone as a real search query: the whole point of the
 *  swarm is that each angle runs blind to what the others find, so the
 *  fan-out is genuinely diverse rather than N near-duplicate searches.
 *  Throws a plain Error on failure (misconfiguration or a bad model
 *  response) - the caller (crm-operations) decides how to surface it. */
export async function deriveAngles(goal: string, n?: number): Promise<string[]> {
  const count = clampAngleCount(n);
  if (!isAngleDerivationConfigured()) {
    throw new Error(
      "Angle derivation is not configured (OPENAI_API_KEY missing). Pass angles explicitly instead.",
    );
  }
  const trimmedGoal = goal.trim();
  if (!trimmedGoal) throw new Error("Provide a discovery goal.");

  const { object } = await generateObject({
    model: openai(MODEL),
    schema: z.object({
      angles: z.array(z.string().trim().min(3).max(300)).min(1).max(MAX_ANGLES),
    }),
    prompt: `You are planning a multi-angle company discovery swarm for a CRM prospecting tool.

Given a broad discovery goal, produce exactly ${count} DISTINCT, COMPLEMENTARY search angles that together cover the goal more thoroughly than one search could. Each angle must be a self-contained, specific search query (not a fragment) that a search engine could run entirely on its own to find real companies - for example split by sub-vertical, by geography, by company stage or funding, by a specific hiring/product/tech signal, or by business model. Avoid overlap: each angle should surface a meaningfully different slice of the goal, not a rephrasing of another angle.

Goal: """${trimmedGoal}"""

Return exactly ${count} angles, each a complete, specific search query a search engine could run on its own.`,
  });

  return [...new Set(object.angles.map((a) => a.trim()).filter(Boolean))].slice(0, count);
}

// ── Merge across angles ─────────────────────────────────────────────────────

export interface AngleResult {
  angle: string;
  companies: FoundCompany[];
}

export interface MergedCompany {
  company: FoundCompany;
  angles: string[]; // every angle that surfaced this company, first-seen order
}

// Same normalization rule crm-operations uses for CRM dedup: domain
// (www-stripped, lowercased) when present, otherwise the company name. Kept
// as one function so cross-angle merge and CRM dedup can never drift onto
// different keys for the same company.
export function normalizeDomain(d?: string | null): string | undefined {
  return d?.toLowerCase().replace(/^www\./, "").trim() || undefined;
}

function mergeKey(c: FoundCompany): string {
  const domain = normalizeDomain(c.domain);
  return domain ? `d:${domain}` : `n:${c.companyName.trim().toLowerCase()}`;
}

/** Merge the results of N angles into one deduped list, recording which
 *  angle(s) surfaced each company. Pure and DB-free: the same company found
 *  by two angles collapses into a single entry with both angles attributed,
 *  BEFORE the CRM-dedup pass (which is a separate, DB-backed step in
 *  crm-operations so this stays unit-testable without mocking prisma). */
export function mergeAngleResults(results: AngleResult[]): {
  merged: MergedCompany[];
  totalFound: number;
} {
  const byKey = new Map<string, MergedCompany>();
  let totalFound = 0;
  for (const { angle, companies } of results) {
    for (const c of companies) {
      totalFound++;
      const key = mergeKey(c);
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.angles.includes(angle)) existing.angles.push(angle);
      } else {
        byKey.set(key, { company: c, angles: [angle] });
      }
    }
  }
  return { merged: [...byKey.values()], totalFound };
}
