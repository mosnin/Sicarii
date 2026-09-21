// Shared secret check for the Cloudflare Worker and the Next.js origin
// endpoints it calls. Always hashes both sides to a fixed length so a
// length mismatch cannot leak through a short-circuit compare.

export function workerSharedSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.WORKER_SECRET?.trim() || env.CRON_SECRET?.trim();
  return secret || null;
}

export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  if (a.byteLength !== b.byteLength) return false;
  let out = 0;
  for (let i = 0; i < a.byteLength; i++) out |= a[i]! ^ b[i]!;
  return out === 0;
}

export async function authorizeWorkerRequest(
  header: string | null,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const expected = workerSharedSecret(env);
  if (!expected) return false;
  const raw = header?.trim() ?? "";
  const provided = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
  if (!provided) return false;
  return secretsMatch(provided, expected);
}
