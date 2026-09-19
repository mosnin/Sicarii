// OpenWork-style named review packs for Company OS (opencompany + openwork).
// Jev sits inside runner turns. Presentation / typed API / durable runner /
// live CRM reads stay ordinary software.

import { noul, type QuestionMap } from "@/lib/jev/contract";

export const WARDEN_PACKS = {
  "pii-review": noul(
    "Would publishing or sending this leak personal data the recipient should not see?",
  ),
  "quote-accuracy": noul("Does every customer-facing claim match the cited source facts?"),
  "crm-schema": noul("Would this write violate Scalar's entity/contact schema or ownership?"),
  "outbound-tone": noul("Is this outbound message off-brand, sloppy, or inappropriately casual/harsh?"),
  "permission-scope": noul("Does this action exceed the actor's role (ae / sdr / admin / agent)?"),
} as const satisfies QuestionMap;

export type WardenPackId = keyof typeof WARDEN_PACKS;

export type CompanyOSState = {
  workspace: { id: string };
  actor: { userId: string; role: "ae" | "sdr" | "admin" | "agent" };
  thread: { goal: string; phase: "research" | "draft" | "send" | "log" | "idle" };
  record?: { type: "lead" | "contact" | "company" | "deal" | "ticket"; id: string };
};

export function wardenBlock(answers: Partial<Record<WardenPackId, number>>): {
  allow: boolean;
  hits: WardenPackId[];
} {
  const hits = (Object.keys(WARDEN_PACKS) as WardenPackId[]).filter(
    (k) => (answers[k] ?? 0) >= 0.75,
  );
  return { allow: hits.length === 0, hits };
}
