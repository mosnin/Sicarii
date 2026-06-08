import { randomUUID } from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

// OAuth 2.0 Dynamic Client Registration (RFC 7591). We register PKCE public
// clients statelessly: the client_id is opaque and PKCE secures the exchange,
// so no client table is needed. Echoes back the client's metadata.
export async function POST(req: Request) {
  // Public, unauthenticated DCR endpoint - cap registrations per IP so it can't
  // be used to spam client registrations.
  if (!(await checkRateLimit(`oauth-register:${clientIp(req)}`, 20, 60 * 60_000)).success) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: cors });
  }

  const body = (await req.json().catch(() => ({}))) as {
    redirect_uris?: string[];
    client_name?: string;
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: string;
    scope?: string;
  };

  const clientId = `mcp_${randomUUID().replace(/-/g, "")}`;

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none",
      grant_types: body.grant_types ?? ["authorization_code", "refresh_token"],
      response_types: body.response_types ?? ["code"],
      redirect_uris: body.redirect_uris ?? [],
      client_name: body.client_name,
      scope: body.scope ?? "mcp",
    },
    { status: 201, headers: cors }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
