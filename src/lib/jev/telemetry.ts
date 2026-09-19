// Structured decision log for later jevcal sweeps. No DB write: founder
// still owes prisma migrate. Logs stay in Convex/Vercel function logs.

import type { Answer } from "./contract";

export type JevDecisionLog = {
  surface: string;
  action: string;
  source: "jev" | "fallback" | "instant";
  answers?: Record<string, Answer>;
  reasons?: string[];
  latencyMs?: number;
};

export function logJevDecision(entry: JevDecisionLog): void {
  console.info("[jev-decision]", {
    surface: entry.surface,
    action: entry.action,
    source: entry.source,
    reasons: entry.reasons ?? [],
    latencyMs: entry.latencyMs,
    keys: entry.answers ? Object.keys(entry.answers) : [],
  });
}
