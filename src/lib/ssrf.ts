// SSRF guard for server-side fetches to user-supplied URLs (e.g. the outbound
// task webhook). Blocks localhost, link-local (incl. cloud metadata 169.254),
// private/reserved ranges, and IPv4-mapped IPv6 so a user can't point the server
// at internal services. Note: this checks the literal host; full protection
// against DNS rebinding would also resolve and re-check the IP before connecting.

function checkIpv4(octets: RegExpMatchArray): boolean {
  const a = Number(octets[1]);
  const b = Number(octets[2]);
  if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
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

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) - bypass if the mapped address is blocked.
  if (h.startsWith("::ffff:")) {
    const mapped = h.slice(7);
    const m4 = mapped.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m4 && checkIpv4(m4)) return true;
    // Hex form e.g. ::ffff:7f00:0001 (loopback) - block conservatively.
    if (!m4) return true;
  }

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) return checkIpv4(m);

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
  // Literal IPs were already vetted by isBlockedHost; nothing to resolve.
  if (/^[\d.:[\]]+$/.test(hostname)) return true;
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(hostname, { all: true, verbatim: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isBlockedHost(a.address));
  } catch {
    return false; // unresolvable = refuse to connect
  }
}
