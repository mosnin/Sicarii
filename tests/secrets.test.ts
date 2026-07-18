import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";

// Provider API keys (User.agentMailApiKey / User.agentPhoneApiKey) must be
// decryptable - the app calls out to the live AgentMail/AgentPhone APIs with
// the plaintext. This pins the AES-256-GCM round trip, the auth-tag tamper
// check, the missing-env-var failure mode, and the legacy-plaintext
// transition fallback (see the TRANSITION NOTE in src/lib/secrets.ts).

const ORIGINAL_KEY = process.env.SECRETS_ENCRYPTION_KEY;
// Two distinct, valid 32-byte keys, generated fresh each run (not secrets -
// test fixtures only; generated rather than hand-typed to avoid transcription
// errors in the encoded length).
const VALID_BASE64_KEY = randomBytes(32).toString("base64");
const VALID_HEX_KEY = randomBytes(32).toString("hex");

async function freshModule() {
  vi.resetModules();
  return import("@/lib/secrets");
}

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("round-trips a plaintext secret through encrypt then decrypt", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = VALID_BASE64_KEY;
    const { encryptSecret, decryptSecret } = await freshModule();

    const plaintext = "sk_live_super_secret_agentmail_key_123";
    const ciphertext = encryptSecret(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.split(":")).toHaveLength(3);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("accepts a hex-encoded 32-byte key as well as base64", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = VALID_HEX_KEY;
    const { encryptSecret, decryptSecret } = await freshModule();

    const plaintext = "hex-key-round-trip";
    const ciphertext = encryptSecret(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = VALID_BASE64_KEY;
    const { encryptSecret } = await freshModule();

    const a = encryptSecret("same-plaintext");
    const b = encryptSecret("same-plaintext");
    expect(a).not.toBe(b);
  });

  it("fails to decrypt tampered ciphertext (GCM auth tag catches it)", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = VALID_BASE64_KEY;
    const { encryptSecret, decryptSecret } = await freshModule();

    const plaintext = "do-not-tamper-with-me";
    const ciphertext = encryptSecret(plaintext);
    const [iv, authTag, data] = ciphertext.split(":");

    // Flip a hex character in the ciphertext body so the auth tag no longer
    // matches. Tampered data is treated as "not our format after all" and
    // falls back to legacy-plaintext behavior (never throws, never returns
    // the real secret) - so it must NOT come back as the original plaintext.
    const flipped = data[0] === "0" ? "1" + data.slice(1) : "0" + data.slice(1);
    const tampered = [iv, authTag, flipped].join(":");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = decryptSecret(tampered);
    expect(result).not.toBe(plaintext);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fails to decrypt when the auth tag itself is tampered", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = VALID_BASE64_KEY;
    const { encryptSecret, decryptSecret } = await freshModule();

    const plaintext = "another-secret";
    const ciphertext = encryptSecret(plaintext);
    const [iv, authTag, data] = ciphertext.split(":");
    const flippedTag = authTag[0] === "0" ? "1" + authTag.slice(1) : "0" + authTag.slice(1);
    const tampered = [iv, flippedTag, data].join(":");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(decryptSecret(tampered)).not.toBe(plaintext);
    warnSpy.mockRestore();
  });

  it("throws a clear error naming the missing env var when unset", async () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    const { encryptSecret, decryptSecret } = await freshModule();

    expect(() => encryptSecret("anything")).toThrow(/SECRETS_ENCRYPTION_KEY/);
    expect(() => decryptSecret("anything")).toThrow(/SECRETS_ENCRYPTION_KEY/);
  });

  it("throws a clear error when the key does not decode to 32 bytes", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = "dG9vc2hvcnQ="; // "tooshort", far under 32 bytes
    const { encryptSecret } = await freshModule();

    expect(() => encryptSecret("anything")).toThrow(/32 bytes/);
  });

  it("treats a legacy plaintext value as plaintext (transition fallback)", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = VALID_BASE64_KEY;
    const { decryptSecret } = await freshModule();

    // A key saved before this change existed - not in iv:authTag:ciphertext
    // shape at all, so it must be handed back unchanged rather than thrown on.
    const legacyPlaintext = "agm-oldkeystoredbeforeencryptionshipped";
    expect(decryptSecret(legacyPlaintext)).toBe(legacyPlaintext);
  });

  it("legacy fallback still works even if the plaintext happens to contain colons", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = VALID_BASE64_KEY;
    const { decryptSecret } = await freshModule();

    // Three colon-separated segments, but not valid hex -> not our format.
    const legacyPlaintext = "not-hex:not-hex-either:zzz";
    expect(decryptSecret(legacyPlaintext)).toBe(legacyPlaintext);
  });

  it("round trip still requires the same key: wrong key falls back instead of decrypting", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = VALID_BASE64_KEY;
    const { encryptSecret } = await freshModule();
    const ciphertext = encryptSecret("secret-under-key-a");

    // Swap in a different valid 32-byte key and try to decrypt the same
    // ciphertext - GCM must reject it (wrong key changes the auth tag check).
    process.env.SECRETS_ENCRYPTION_KEY = VALID_HEX_KEY;
    const { decryptSecret } = await freshModule();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(decryptSecret(ciphertext)).not.toBe("secret-under-key-a");
    warnSpy.mockRestore();
  });
});
