// SSRF guard for server-side fetches to user-supplied URLs (e.g. the outbound
// task webhook). Blocks localhost, link-local (incl. cloud metadata 169.254),
// private/reserved ranges, and IPv4-mapped IPv6 so a user can't point the server
// at internal services. Note: this checks the literal host; full protection
// against DNS rebinding would also resolve and re-check the IP before connecting.

function isBlockedIpv4(o: readonly number[]): boolean {
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

// Parse ONE inet_aton part: decimal, octal (leading 0), or hex (0x). This is
// how the C resolver reads addresses, so http://0x7f.0.0.1 and http://0177.1
// both reach 127.0.0.1 - a naive dotted-decimal regex misses them.
function parsePart(s: string): number {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^0[0-7]*$/.test(s)) return parseInt(s || "0", 8);
  if (/^[1-9][0-9]*$/.test(s)) return parseInt(s, 10);
  return NaN;
}

// Normalize any inet_aton-style IPv4 host (1-4 parts, any base, short forms
// like 127.1 and integer forms like 2130706433) to canonical octets, or null
// if it is not an IPv4 literal at all.
function inetAtonOctets(host: string): number[] | null {
  if (!/^[0-9a-fx.]+$/i.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums = parts.map(parsePart);
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;

  let value: number;
  if (nums.length === 1) {
    if (nums[0] > 0xffffffff) return null;
    value = nums[0];
  } else if (nums.length === 2) {
    if (nums[0] > 0xff || nums[1] > 0xffffff) return null;
    value = nums[0] * 0x1000000 + nums[1];
  } else if (nums.length === 3) {
    if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null;
    value = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2];
  } else {
    if (nums.some((n) => n > 0xff)) return null;
    value = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2] * 0x100 + nums[3];
  }
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!h) return true;
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal"
  ) {
    return true;
  }
  // IPv6 loopback / link-local / unique-local.
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) - block if the mapped address is blocked.
  if (h.startsWith("::ffff:")) {
    const octets = inetAtonOctets(h.slice(7));
    if (octets && isBlockedIpv4(octets)) return true;
    if (!octets) return true; // hex-mapped form e.g. ::ffff:7f00:1 - block conservatively
  }

  // Any IPv4 literal in any base/short form (dotted-decimal, integer, octal, hex).
  const octets = inetAtonOctets(h);
  if (octets) return isBlockedIpv4(octets);

  return false;
}

// Parse a string into a safe outbound HTTPS URL, or null if it's malformed,
// non-HTTPS, or points at a blocked/internal host. HTTP is intentionally not
// allowed for outbound webhooks: plaintext delivery exposes webhook payloads
// to on-path observers in shared cloud environments.
export function safeHttpUrl(raw?: string | null): URL | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (isBlockedHost(u.hostname)) return null;
  return u;
}

/**
 * DNS-rebinding defense: resolve the hostname and verify EVERY resolved address
 * is public before connecting. The literal-host check in safeHttpUrl can be
 * defeated by a domain whose A record points at an internal IP (or is swapped
 * to one between check and fetch); resolving here and rejecting private ranges
 * closes the practical attack (a TTL-0 swap in the microseconds between this
 * resolution and the fetch remains theoretical - full immunity requires pinning
 * the socket to the checked IP, which Node fetch does not expose).
 */
export async function resolvesToPublicIp(hostname: string): Promise<boolean> {
  // A literal IP (any form) was already vetted by isBlockedHost - if it reached
  // here it was public, so there is nothing to resolve. Re-check via isBlockedHost
  // rather than a loose digit regex (which used to wave through integer IPs like
  // 2130706433), so a numeric loopback can never skip the guard.
  if (inetAtonOctets(hostname) !== null || hostname.includes(":")) {
    return !isBlockedHost(hostname);
  }
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(hostname, { all: true, verbatim: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isBlockedHost(a.address));
  } catch {
    return false; // unresolvable = refuse to connect
  }
}
