import {
  verifyToken,
  verifyPkceS256,
  signAccessToken,
  signRefreshToken,
  consumeRefreshToken,
  ACCESS_TTL,
  type CodeClaims,
} from "@/lib/oauth";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

function err(code: string, status = 400, desc?: string) {
  return Response.json({ error: code, ...(desc ? { error_description: desc } : {}) }, { status, headers: cors });
}

// OAuth 2.1 token endpoint. Supports authorization_code (PKCE) and refresh_token.
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

    const claims = code ? await verifyToken<CodeClaims>(code) : null;
    if (!claims || claims.typ !== "code") return err("invalid_grant", 400, "Bad or expired code");
    if (claims.redirect_uri !== redirectUri) return err("invalid_grant", 400, "redirect_uri mismatch");
    if (!verifyPkceS256(verifier, claims.code_challenge)) return err("invalid_grant", 400, "PKCE verification failed");

    const access = await signAccessToken(claims.sub, claims.scope);
    const refresh = await signRefreshToken(claims.sub, claims.scope);
    return Response.json(
      { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: claims.scope ?? "mcp" },
      { headers: cors }
    );
  }

  if (grant === "refresh_token") {
    const rt = form.get("refresh_token");
    if (!rt) return err("invalid_request");
    // Rotation with reuse detection: consuming revokes the presented token and
    // fails if it was already used (stolen-token replay is caught here).
    const claims = await consumeRefreshToken(rt);
    if (!claims) return err("invalid_grant", 400, "Bad, expired, or already-used refresh token");
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
      { headers: cors }
    );
  }

  return err("unsupported_grant_type");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
