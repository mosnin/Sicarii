// Authenticated encryption for secrets we must be able to READ back (SMTP /
// IMAP passwords for agent mailboxes). Scalar's own API keys are hashed
// because we only ever compare them; a mailbox password has to be presented
// to the mail server on every send, so it is sealed instead: AES-256-GCM with
// a random 96-bit nonce, keyed by MAILBOX_SECRET_KEY (32 bytes, hex or
// base64). The ciphertext format is versioned so the key can be rotated later
// without a flag day: `v1.<nonce b64>.<ciphertext b64>.<tag b64>`.
//
// Fail closed: without MAILBOX_SECRET_KEY, sealing throws and SMTP mailboxes
// cannot be created (the route surfaces a clear 501). AgentMail mailboxes do
// not need this key at all.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALG = "aes-256-gcm";
const VERSION = "v1";

export function isSecretBoxConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return loadKey(env) !== null;
}

function loadKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.MAILBOX_SECRET_KEY?.trim();
  if (!raw) return null;
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, "hex");
  else buf = Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

function requireKey(): Buffer {
  const key = loadKey();
  if (!key) {
    throw new Error(
      "MAILBOX_SECRET_KEY is not set (or is not 32 bytes). Generate one with `openssl rand -hex 32`.",
    );
  }
  return key;
}

export function sealSecret(plaintext: string): string {
  const key = requireKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALG, key, nonce);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce.toString("base64"), body.toString("base64"), tag.toString("base64")].join(".");
}

export function openSecret(sealed: string): string {
  const key = requireKey();
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognised sealed secret format");
  }
  const [, nonceB64, bodyB64, tagB64] = parts;
  const decipher = createDecipheriv(ALG, key, Buffer.from(nonceB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const out = Buffer.concat([decipher.update(Buffer.from(bodyB64, "base64")), decipher.final()]);
  return out.toString("utf8");
}
