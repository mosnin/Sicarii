import { expect, it } from "vitest";
import { isMcpResource } from "@/lib/mcp-resource";
it.each(["https://tryscalar.xyz/api/mcp/mcp", "https://www.tryscalar.xyz/api/mcp/mcp?profile=codex"])("accepts the actual MCP audience %s", uri => {
  expect(isMcpResource(uri, "https://www.tryscalar.xyz")).toBe(true);
});
it.each(["https://elsewhere.example/api/mcp/mcp", "https://tryscalar.xyz/api/other", "http://tryscalar.xyz/api/mcp/mcp", "https://tryscalar.xyz/api/mcp/mcp?profile=codex&x=1", "https://user@tryscalar.xyz/api/mcp/mcp", "https://tryscalar.xyz/api/mcp/mcp#x"])("rejects another audience %s", uri => {
  expect(isMcpResource(uri, "https://www.tryscalar.xyz")).toBe(false);
});
