import { getPublicOrigin, generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from "mcp-handler";

// OAuth 2.0 Protected Resource Metadata (RFC 9728). Served at
// /.well-known/oauth-protected-resource via a rewrite. Points MCP clients at our
// authorization server (this app) for the MCP resource.
export function GET(req: Request) {
  const origin = getPublicOrigin(req);
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp/mcp`,
  });
  return Response.json(metadata, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
