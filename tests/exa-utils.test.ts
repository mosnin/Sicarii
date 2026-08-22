// Enrichment accuracy guards: isMeaningful junk filtering and the Exa webhook
// token (the receiver must fail closed when no secret exists at all).
import { describe, it, expect, vi, afterEach } from "vitest";
import { isMeaningful, exaWebhookToken, exaWebhookTokenValid } from "@/lib/exa";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isMeaningful", () => {
  it("rejects empty and null-ish input", () => {
    expect(isMeaningful("")).toBe(false);
    expect(isMeaningful(null)).toBe(false);
    expect(isMeaningful(undefined)).toBe(false);
    expect(isMeaningful("   ")).toBe(false);
  });

  it("rejects junk LLM placeholder values", () => {
    expect(isMeaningful("null")).toBe(false);
    expect(isMeaningful("NULL")).toBe(false);
    expect(isMeaningful("undefined")).toBe(false);
    expect(isMeaningful("N/A")).toBe(false);
    expect(isMeaningful("na")).toBe(false);
    expect(isMeaningful("none")).toBe(false);
    expect(isMeaningful("unknown")).toBe(false);
    expect(isMeaningful("Unknown")).toBe(false);
    expect(isMeaningful("-")).toBe(false);
  });

  it("rejects single characters", () => {
    expect(isMeaningful("a")).toBe(false);
    expect(isMeaningful("x")).toBe(false);
    expect(isMeaningful("1")).toBe(false);
  });

  it("accepts real names and values", () => {
    expect(isMeaningful("Acme Corp")).toBe(true);
    expect(isMeaningful("Jane Doe")).toBe(true);
    expect(isMeaningful("acme.com")).toBe(true);
    expect(isMeaningful("VP of Sales")).toBe(true);
  });
});

describe("exa webhook token", () => {
  it("validates the explicit EXA_WEBHOOK_SECRET", () => {
    vi.stubEnv("EXA_WEBHOOK_SECRET", "test-webhook-secret");
    expect(exaWebhookToken()).toBe("test-webhook-secret");
    expect(exaWebhookTokenValid("test-webhook-secret")).toBe(true);
  });

  it("rejects wrong, empty, and null tokens", () => {
    vi.stubEnv("EXA_WEBHOOK_SECRET", "test-webhook-secret");
    expect(exaWebhookTokenValid("wrong-token")).toBe(false);
    expect(exaWebhookTokenValid("")).toBe(false);
    expect(exaWebhookTokenValid(null)).toBe(false);
    expect(exaWebhookTokenValid(undefined)).toBe(false);
  });

  it("derives a stable token from MCP_OAUTH_SECRET when no explicit secret is set", () => {
    vi.stubEnv("EXA_WEBHOOK_SECRET", undefined);
    vi.stubEnv("MCP_OAUTH_SECRET", "server-secret");
    vi.stubEnv("CLERK_SECRET_KEY", undefined);
    const token = exaWebhookToken();
    expect(token).toBeTruthy();
    expect(token).not.toBe("server-secret"); // HMAC-derived, not the raw secret
    expect(exaWebhookTokenValid(token)).toBe(true);
  });

  it("fails closed when no server secret exists at all", () => {
    vi.stubEnv("EXA_WEBHOOK_SECRET", undefined);
    vi.stubEnv("MCP_OAUTH_SECRET", undefined);
    vi.stubEnv("CLERK_SECRET_KEY", undefined);
    expect(exaWebhookToken()).toBeNull();
    expect(exaWebhookTokenValid("anything")).toBe(false);
    expect(exaWebhookTokenValid("")).toBe(false);
    expect(exaWebhookTokenValid(null)).toBe(false);
  });
});
