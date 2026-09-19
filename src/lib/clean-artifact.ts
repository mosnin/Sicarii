import { OpError } from "@/lib/op-error";
import { scanMalicious } from "@/lib/jev";

/** Shared write-path scan so CRM, variants, and drafts cannot drift. */
export async function assertCleanArtifact(text: string, kind: string) {
  const payload = text.trim();
  if (!payload) return;
  const malicious = await scanMalicious(payload, kind);
  if (!malicious.allow) {
    throw new OpError(`Jev blocked this ${kind} as malicious (${malicious.reasons.join(", ")}).`, 422);
  }
}
