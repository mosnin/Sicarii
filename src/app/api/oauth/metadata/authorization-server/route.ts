import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";

// OAuth 2.0 Authorization Server Metadata (RFC 8414). Served at
// /.well-known/oauth-authorization-server via a rewrite in next.config.
export function GET(req: Request) {
  const origin = getPublicOrigin(req);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp"],
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }
  );
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
