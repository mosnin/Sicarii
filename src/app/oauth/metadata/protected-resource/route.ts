import {
  getPublicOrigin,
  generateProtectedResourceMetadata,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

// OAuth 2.0 Protected Resource Metadata (RFC 9728). Served at
// /.well-known/oauth-protected-resource via a rewrite. Points clients at this
// app as the authorization server for the MCP resource, which is what turns a
// 401 from /api/mcp into an OAuth flow.
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
