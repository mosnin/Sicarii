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

export async function authorize(header: string | null, secret: string): Promise<boolean> {
  if (!secret) return false;
  const raw = header?.trim() ?? "";
  const provided = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
  if (!provided) return false;
  return secretsMatch(provided, secret);
}
