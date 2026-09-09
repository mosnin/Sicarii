import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { SUPPORTED_SCOPES } from "@/lib/oauth-server";

// OAuth 2.0 Authorization Server Metadata (RFC 8414). Served at
// /.well-known/oauth-authorization-server via a rewrite in next.config.
//
// This describes the stateful server under /oauth/*. We do not issue id_tokens,
// so there is no jwks_uri and this is not a full OIDC provider document; the
// userinfo endpoint is advertised because clients holding "openid" or "profile"
// can call it. See docs/OAUTH.md.
export function GET(req: Request) {
  const origin = getPublicOrigin(req);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      device_authorization_endpoint: `${origin}/oauth/device/code`,
      token_endpoint: `${origin}/oauth/token`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      userinfo_endpoint: `${origin}/oauth/userinfo`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: [
        "authorization_code",
        "refresh_token",
        "urn:ietf:params:oauth:grant-type:device_code",
      ],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      subject_types_supported: ["public"],
      scopes_supported: SUPPORTED_SCOPES,
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } },
  );
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
