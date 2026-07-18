// Reversible encryption at rest for provider API keys we must call out with
// (User.agentMailApiKey, User.agentPhoneApiKey). Unlike Scalar's own API keys
// (src/lib/api-auth.ts, SHA-256 hashed - never recoverable), these two must be
// DECRYPTABLE: the app calls the live AgentMail/AgentPhone APIs using the
// plaintext key (src/lib/agentmail.ts, src/lib/agentphone.ts). Hashing would
// make that impossible, so this uses AES-256-GCM (authenticated encryption)
// instead of a homegrown scheme.
//
// Key: SECRETS_ENCRYPTION_KEY, 32 raw bytes, base64 or hex encoded. Generate
// with `openssl rand -base64 32`. Missing key -> throw, never a silent
// plaintext fallback (that would defeat the whole point of this module).
//
// Ciphertext format: `iv:authTag:ciphertext`, each segment hex-encoded, joined
// with the module's own delimiter so it fits the existing `String?` columns
// with no schema migration.
//
// TRANSITION NOTE (legacy plaintext): this field already has real rows stored
// as plaintext in production (pre-encryption). decryptSecret() is tolerant of
// that: if the stored value does not look like our `iv:authTag:ciphertext`
// format (wrong shape, or the hex/GCM decrypt fails), it logs a warning and
// returns the stored value AS-IS, treating it as legacy plaintext, rather than
// throwing. This keeps every existing connection working with zero downtime
// and no destructive migration. New writes always go through encryptSecret()
// and are stored encrypted. A follow-up backfill job (re-save each user's
// existing key through the settings form, or an ops script that loads +
// re-saves every non-null key) should force re-encryption of the legacy rows;
// that backfill is a separate founder/ops action, not part of this change.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended IV length for GCM
const KEY_BYTES = 32; // AES-256
const DELIMITER = ":";

function getEncryptionKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` " +
        "and set it in the environment before encrypting or decrypting secrets."
    );
  }

  let key: Buffer;
  // Accept base64 (openssl rand -base64 32 output) or hex (64 hex chars).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). ` +
        "Generate one with `openssl rand -base64 32`."
    );
  }

  return key;
}

/** Encrypt a plaintext secret for storage. Always encrypts (no fallback). */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(DELIMITER);
}

/** True if `value` has the shape this module writes (does not verify it decrypts). */
function looksLikeCiphertext(value: string): boolean {
  const parts = value.split(DELIMITER);
  if (parts.length !== 3) return false;
  const [iv, authTag, ciphertext] = parts;
  return (
    /^[0-9a-fA-F]+$/.test(iv) &&
    /^[0-9a-fA-F]+$/.test(authTag) &&
    /^[0-9a-fA-F]*$/.test(ciphertext) &&
    iv.length === IV_LENGTH * 2 &&
    authTag.length === 32 // 16-byte GCM auth tag, hex-encoded
  );
}

/**
 * Decrypt a stored secret. Tolerant of legacy plaintext (see TRANSITION NOTE
 * above): if `ciphertext` doesn't look like our format, or decryption fails
 * for any reason (wrong key, tampered/corrupt data), this logs a warning and
 * returns the stored value unchanged instead of throwing - it is assumed to
 * be a pre-encryption plaintext key still sitting in the database.
 *
 * Still throws if SECRETS_ENCRYPTION_KEY itself is missing: that's a
 * deployment misconfiguration, not a legacy-data situation, and failing loud
 * there is what prevents a silent no-op "encryption" layer.
 */
export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();

  if (!looksLikeCiphertext(ciphertext)) {
    return ciphertext; // legacy plaintext - not in our format at all
  }

  try {
    const [ivHex, authTagHex, dataHex] = ciphertext.split(DELIMITER);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const data = Buffer.from(dataHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (e) {
    console.warn(
      "[secrets] decryptSecret: value looked encrypted but failed to decrypt " +
        "(wrong key, tampered data, or legacy plaintext that coincidentally " +
        "matches the ciphertext shape). Falling back to treating it as plaintext.",
      e
    );
    return ciphertext;
  }
}
