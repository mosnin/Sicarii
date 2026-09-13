/** Accept only the Scalar MCP audience, including its reviewed catalog URL. */
export function isMcpResource(candidate: string, origin: string): boolean {
  try {
    const url = new URL(candidate), expected = new URL(origin);
    const hosts = new Set(["tryscalar.xyz", "www.tryscalar.xyz"]);
    const sameOrigin = url.origin === expected.origin ||
      (hosts.has(url.hostname) && hosts.has(expected.hostname) &&
       !url.port && !expected.port && url.protocol === expected.protocol);
    return sameOrigin && url.pathname === "/api/mcp/mcp" &&
      (!url.search || (url.searchParams.size === 1 && url.searchParams.get("profile") === "codex")) &&
      !url.hash && !url.username && !url.password;
  } catch { return false; }
}
