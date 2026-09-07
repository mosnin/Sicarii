import { bearerFromRequest } from "@/lib/api-auth";
import { authenticateOauthAccessToken, hasAnyScope } from "@/lib/oauth-server";
import { buildCompanyOsOverview, scalarPublicOrigin } from "@/lib/company-os-overview";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, no-store",
};

function authError(status: number, error: string, description: string, scope?: string) {
  return Response.json(
    { error, error_description: description },
    { status, headers: { ...headers, "WWW-Authenticate": `Bearer error="${error}"${scope ? `, scope="${scope}"` : ""}` } },
  );
}

export async function GET(req: Request) {
  const ctx = await authenticateOauthAccessToken(bearerFromRequest(req));
  if (!ctx) return authError(401, "invalid_token", "A valid Scalar OAuth access token is required");
  if (!hasAnyScope(ctx, ["company-os:overview", "crm:read"])) {
    return authError(403, "insufficient_scope", "The overview requires read access", "company-os:overview crm:read");
  }

  const origin = scalarPublicOrigin(req);
  const expectedResource = `${origin}/api/company-os/overview`;
  if (ctx.resource && ctx.resource !== expectedResource) {
    return authError(403, "invalid_target", "This token was issued for a different resource");
  }

  const overview = await buildCompanyOsOverview(ctx.accountId, origin);
  if (!overview) return authError(401, "invalid_token", "The authorized account no longer exists");
  return Response.json(overview, { headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
