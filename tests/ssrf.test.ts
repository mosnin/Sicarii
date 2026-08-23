import { describe, it, expect } from "vitest";
import { isBlockedHost, safeHttpUrl } from "@/lib/ssrf";

// The SSRF guard is a security boundary: user-supplied webhook URLs must never
// reach localhost, private ranges, or cloud metadata. These tests pin the
// blocklist so a refactor cannot silently reopen a bypass.

describe("isBlockedHost", () => {
  it("blocks localhost and internal names", () => {
    for (const h of [
      "localhost",
      "sub.localhost",
      "printer.local",
      "db.internal",
      "metadata.google.internal",
      "",
    ]) {
      expect(isBlockedHost(h), h).toBe(true);
    }
  });

  it("blocks IPv4 private, loopback, link-local, CGNAT, and reserved ranges", () => {
    for (const h of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // multicast
    ]) {
      expect(isBlockedHost(h), h).toBe(true);
    }
  });

  it("blocks IPv6 loopback, link-local, unique-local, and IPv4-mapped forms", () => {
    for (const h of [
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1", // the mapped-loopback bypass fixed in the audit
      "::ffff:169.254.169.254",
      "::ffff:10.0.0.1",
      "::ffff:7f00:1", // hex-mapped form is blocked conservatively
    ]) {
      expect(isBlockedHost(h), h).toBe(true);
    }
  });

  it("blocks obfuscated IPv4 (integer, hex, octal, short forms) that resolve to loopback/metadata", () => {
    for (const h of [
      "2130706433", // decimal for 127.0.0.1
      "0x7f000001", // hex for 127.0.0.1
      "0x7f.0.0.1", // mixed hex
      "0177.0.0.1", // octal 0177 = 127
      "127.1", // short form => 127.0.0.1
      "127.0.1", // 3-part short form
      "017700000001", // octal integer for 127.0.0.1
      "2852039166", // decimal for 169.254.169.254 (cloud metadata)
      "0xA9FEA9FE", // hex for 169.254.169.254
    ]) {
      expect(isBlockedHost(h), h).toBe(true);
    }
  });

  it("allows normal public hosts and public numeric IPs", () => {
    for (const h of ["example.com", "hooks.zapier.com", "8.8.8.8", "172.32.0.1", "100.128.0.1", "134744072" /* 8.8.8.8 */]) {
      expect(isBlockedHost(h), h).toBe(false);
    }
  });
});

describe("safeHttpUrl", () => {
  it("accepts only https URLs to public hosts", () => {
    expect(safeHttpUrl("https://example.com/webhook")?.hostname).toBe("example.com");
  });

  it("rejects http (plaintext webhook delivery)", () => {
    expect(safeHttpUrl("http://example.com/webhook")).toBeNull();
  });

  it("rejects non-http schemes, malformed input, and blocked hosts", () => {
    for (const raw of [
      "ftp://example.com",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
      null,
      undefined,
      "https://127.0.0.1/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://169.254.169.254/latest/meta-data",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://2130706433/x", // integer loopback
      "https://0x7f000001/x", // hex loopback
      "https://2852039166/x", // integer cloud metadata
    ]) {
      expect(safeHttpUrl(raw as string | null | undefined), String(raw)).toBeNull();
    }
  });
});
