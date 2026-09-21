// AES-256-GCM for mailbox SMTP secrets at rest. We never store plaintext
// passwords. The key is derived from MAILBOX_SECRET, falling back to
// MCP_OAUTH_SECRET then CLERK_SECRET_KEY so local/dev still works, with a
// warning that production should set a distinct MAILBOX_SECRET.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = "v1";

export interface SmtpSecret {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

function keyBytes(): Buffer {
  const raw =
    process.env.MAILBOX_SECRET?.trim() ||
    process.env.MCP_OAUTH_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error("MAILBOX_SECRET (or MCP_OAUTH_SECRET / CLERK_SECRET_KEY) is required to store mailbox credentials.");
  }
  return createHash("sha256").update(raw).digest();
}

export function mailboxCryptoConfigured(): boolean {
  return Boolean(
    process.env.MAILBOX_SECRET?.trim() ||
      process.env.MCP_OAUTH_SECRET?.trim() ||
      process.env.CLERK_SECRET_KEY?.trim(),
  );
}

export function encryptSmtpSecret(secret: SmtpSecret): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, keyBytes(), iv);
  const plaintext = Buffer.from(JSON.stringify(secret), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSmtpSecret(ciphertext: string): SmtpSecret {
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Unrecognized mailbox credential format.");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const enc = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Corrupt mailbox credential.");
  }
  const decipher = createDecipheriv(ALGO, keyBytes(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(plain) as Partial<SmtpSecret>;
  if (
    typeof parsed.host !== "string" ||
    typeof parsed.port !== "number" ||
    typeof parsed.username !== "string" ||
    typeof parsed.password !== "string"
  ) {
    throw new Error("Mailbox credential payload is incomplete.");
  }
  return {
    host: parsed.host,
    port: parsed.port,
    secure: Boolean(parsed.secure),
    username: parsed.username,
    password: parsed.password,
  };
}

export function smtpLast4(username: string): string {
  const trimmed = username.trim();
  return trimmed.slice(-4).padStart(4, "*");
}

/** Generic secret-box for AgentMail / AgentPhone / IMAP strings.
 *  Same AES-256-GCM envelope as SMTP. Plaintext values stay readable
 *  until a write seals them (no live rotate in this environment). */
export function isSealedSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(".");
  return parts.length === 4 && parts[0] === PREFIX;
}

export function sealSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function openSecret(ciphertext: string): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Unrecognized secret-box format.");
  }
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const enc = Buffer.from(parts[3]!, "base64url");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Corrupt secret-box.");
  }
  const decipher = createDecipheriv(ALGO, keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Decrypt if sealed; otherwise return the stored plaintext (migration debt). */
export function openUserSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isSealedSecret(value)) return value;
  try {
    return openSecret(value);
  } catch {
    return null;
  }
}

export function sealIfPlain(value: string): string {
  if (isSealedSecret(value)) return value;
  if (!mailboxCryptoConfigured()) return value;
  return sealSecret(value);
}

export function secretDisplayLast4(value: string | null | undefined): string | null {
  const plain = openUserSecret(value);
  if (!plain) return null;
  return plain.slice(-4);
}
