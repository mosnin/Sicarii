import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

const PREFIX = "scl_";

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Mint a new API key. The plaintext is returned once and never stored. */
export function generateApiKey(): {
  plaintext: string;
  hashedKey: string;
  prefix: string;
  last4: string;
} {
  const secret = randomBytes(24).toString("base64url"); // 32 url-safe chars
  const plaintext = `${PREFIX}${secret}`;
  return {
    plaintext,
    hashedKey: hashApiKey(plaintext),
    prefix: plaintext.slice(0, PREFIX.length + 4),
    last4: plaintext.slice(-4),
  };
}

/** Like authenticateApiKey, but also returns which key authenticated, so the
 *  MCP layer can attribute writes to a specific agent (key) in team
 *  workspaces. Updates lastUsedAt best-effort. */
export async function authenticateApiKeyDetailed(
  token?: string,
): Promise<{ user: User; keyId: string; keyName: string } | null> {
  if (!token || !token.startsWith(PREFIX)) return null;
  const hashedKey = hashApiKey(token);
  const key = await prisma.apiKey.findUnique({
    where: { hashedKey },
    include: { user: true },
  });
  if (!key || key.revokedAt) return null;
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { user: key.user, keyId: key.id, keyName: key.name };
}

/** Resolve the user for a bearer token, or null. Updates lastUsedAt. */
export async function authenticateApiKey(token?: string): Promise<User | null> {
  if (!token || !token.startsWith(PREFIX)) return null;
  const hashedKey = hashApiKey(token);
  const key = await prisma.apiKey.findUnique({
    where: { hashedKey },
    include: { user: true },
  });
  if (!key || key.revokedAt) return null;
  // Best-effort usage stamp; don't block the request on it.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return key.user;
}

/** Pull the bearer token out of an Authorization header. */
export function bearerFromRequest(req: Request): string | undefined {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value.trim() : undefined;
}
