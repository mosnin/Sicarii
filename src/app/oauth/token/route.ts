import { checkRateLimit } from "@/lib/rate-limit";
import { exchangeAuthorizationCode, rotateRefreshToken, type GrantResult } from "@/lib/oauth-server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

function respond(result: GrantResult): Response {
  if (result.ok) return Response.json(result.tokens, { headers: cors });
  return Response.json(
    {
      error: result.error,
      ...(result.description ? { error_description: result.description } : {}),
      // Replay is a security event, not an ordinary failure. These two extra
      // members let a client prove to itself that the leaked credential is
      // dead and record what the revoked grant had held.
      ...(result.revoked ? { grant_revoked: true, recovery_status: result.revoked } : {}),
      ...(result.revoked && result.scope ? { scope: result.scope } : {}),
    },
    { status: result.status, headers: cors },
  );
}

/**
 * OAuth 2.1 token endpoint. application/x-www-form-urlencoded, two grants:
 * authorization_code (PKCE S256, byte-exact redirect_uri, single use) and
 * refresh_token (rotated on every use). Replaying either revokes the grant.
 */
export async function POST(req: Request) {
  if (!(await checkRateLimit(`oauth-token:${clientIp(req)}`, 120, 60_000)).success) {
    return Response.json({ error: "slow_down" }, { status: 429, headers: { ...cors, "Retry-After": "60" } });
  }

  let form: URLSearchParams;
  try {
    const fd = await req.formData();
    form = new URLSearchParams();
    for (const [key, value] of fd.entries()) form.set(key, String(value));
  } catch {
    return Response.json(
      { error: "invalid_request", error_description: "Expected a form-encoded body" },
      { status: 400, headers: cors },
    );
  }

  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  const resource = form.get("resource");

  if (grantType === "authorization_code") {
    return respond(
      await exchangeAuthorizationCode({
        code: form.get("code"),
        codeVerifier: form.get("code_verifier"),
        clientId,
        redirectUri: form.get("redirect_uri"),
        resource,
      }),
    );
  }

  if (grantType === "refresh_token") {
    return respond(
      await rotateRefreshToken({
        refreshToken: form.get("refresh_token"),
        clientId,
        resource,
      }),
    );
  }

  return Response.json(
    { error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token" },
    { status: 400, headers: cors },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
