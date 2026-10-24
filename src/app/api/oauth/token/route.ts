import {
  verifyToken,
  verifyPkceS256,
  signAccessToken,
  signRefreshToken,
  consumeRefreshToken,
  consumeAuthorizationCode,
  ACCESS_TTL,
  type CodeClaims,
} from "@/lib/oauth";
import {
  exchangeAuthorizationCode,
  rotateRefreshToken,
  type GrantResult,
} from "@/lib/oauth-server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

function err(code: string, status = 400, desc?: string) {
  return Response.json({ error: code, ...(desc ? { error_description: desc } : {}) }, { status, headers: cors });
}

function respondGrant(result: GrantResult): Response {
  if (result.ok) return Response.json(result.tokens, { headers: cors });
  return Response.json(
    {
      error: result.error,
      ...(result.description ? { error_description: result.description } : {}),
    },
    { status: result.status, headers: cors },
  );
}

// OAuth 2.1 token endpoint. Supports authorization_code (PKCE) and refresh_token.
// JWT codes leftover from the pre-consent /api/oauth/authorize are consumed
// once; codes minted by /oauth/authorize are handed to the stateful server so
// old clients that still post here keep working after the authorize redirect.
export async function POST(req: Request) {
  let form: URLSearchParams;
  try {
    const fd = await req.formData();
    form = new URLSearchParams();
    for (const [k, v] of fd.entries()) form.set(k, String(v));
  } catch {
    return err("invalid_request", 400, "Expected form-encoded body");
  }

  const grant = form.get("grant_type");

  if (grant === "authorization_code") {
    const code = form.get("code");
    const redirectUri = form.get("redirect_uri");
    const verifier = form.get("code_verifier");
    if (!code || !redirectUri || !verifier) return err("invalid_request");

    const jwtClaims = await verifyToken<CodeClaims>(code);
    if (jwtClaims && jwtClaims.typ === "code") {
      const claims = await consumeAuthorizationCode(code);
      if (!claims) return err("invalid_grant", 400, "Bad, expired, or already-used code");
      if (claims.redirect_uri !== redirectUri) return err("invalid_grant", 400, "redirect_uri mismatch");
      const clientId = form.get("client_id");
      if (clientId && claims.client_id && clientId !== claims.client_id) {
        return err("invalid_grant", 400, "client_id mismatch");
      }
      if (!verifyPkceS256(verifier, claims.code_challenge)) {
        return err("invalid_grant", 400, "PKCE verification failed");
      }

      const access = await signAccessToken(claims.sub, claims.scope);
      const refresh = await signRefreshToken(claims.sub, claims.scope);
      return Response.json(
        {
          access_token: access,
          token_type: "Bearer",
          expires_in: ACCESS_TTL,
          refresh_token: refresh,
          scope: claims.scope ?? "mcp",
        },
        { headers: cors },
      );
    }

    return respondGrant(
      await exchangeAuthorizationCode({
        code,
        codeVerifier: verifier,
        clientId: form.get("client_id"),
        redirectUri,
        resource: form.get("resource"),
      }),
    );
  }

  if (grant === "refresh_token") {
    const rt = form.get("refresh_token");
    if (!rt) return err("invalid_request");
    // Rotation with reuse detection: consuming revokes the presented token and
    // fails if it was already used (stolen-token replay is caught here).
    const claims = await consumeRefreshToken(rt);
    if (claims) {
      const access = await signAccessToken(claims.sub, claims.scope);
      const refresh = await signRefreshToken(claims.sub, claims.scope);
      return Response.json(
        {
          access_token: access,
          token_type: "Bearer",
          expires_in: ACCESS_TTL,
          refresh_token: refresh,
          scope: claims.scope ?? "mcp",
        },
        { headers: cors },
      );
    }
    return respondGrant(
      await rotateRefreshToken({
        refreshToken: rt,
        clientId: form.get("client_id"),
        resource: form.get("resource"),
      }),
    );
  }

  return err("unsupported_grant_type");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
