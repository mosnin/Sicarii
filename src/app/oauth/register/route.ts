import { checkRateLimit } from "@/lib/rate-limit";
import { DEFAULT_SCOPES, SUPPORTED_SCOPES, narrowScopes, parseScopes, registerClient } from "@/lib/oauth-server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

function isHttpsOrLoopback(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/**
 * Dynamic Client Registration (RFC 7591) for public PKCE clients. It writes one
 * oauth_clients row and hands back an opaque client_id; there is no client
 * secret, because PKCE is what secures the exchange.
 *
 * Registering is not a grant of anything: a client still cannot read a byte
 * until a person approves it on the consent screen, and the redirect URIs it
 * pins here are the only addresses a code will ever be sent to. Capped per IP so
 * it cannot be used to fill the table.
 */
export async function POST(req: Request) {
  if (!(await checkRateLimit(`oauth-register:${clientIp(req)}`, 20, 60 * 60_000)).success) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...cors, "Retry-After": "3600" } });
  }

  const body = (await req.json().catch(() => ({}))) as {
    redirect_uris?: unknown;
    client_name?: unknown;
    scope?: unknown;
  };

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string" && isHttpsOrLoopback(u)).slice(0, 10)
    : [];
  if (redirectUris.length === 0) {
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: "At least one https (or http loopback) redirect_uri is required",
      },
      { status: 400, headers: cors },
    );
  }

  const requested = parseScopes(typeof body.scope === "string" ? body.scope : null);
  const scopes = narrowScopes(requested.length ? requested : DEFAULT_SCOPES, SUPPORTED_SCOPES);
  const name =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim().slice(0, 120)
      : "Unnamed client";

  const client = await registerClient({ name, redirectUris, scopes });

  return Response.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: client.scopes.join(" "),
    },
    { status: 201, headers: cors },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
