import { scalarPublicOrigin } from "@/lib/company-os-overview";

export function GET(req: Request) {
  const origin = scalarPublicOrigin(req);
  return Response.json(
    {
      schemaVersion: "2026-09-01",
      id: "scalar",
      name: "Scalar",
      description: "Agent-operated company intelligence and CRM",
      authorizationServer: `${origin}/.well-known/oauth-authorization-server`,
      oauth: {
        scopes: ["openid", "profile", "company-os:overview"],
        resource: `${origin}/api/company-os/overview`,
        pkceMethods: ["S256"],
      },
      surfaces: {
        overview: `${origin}/api/company-os/overview`,
        openInApp: `${origin}/dashboard`,
      },
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } },
  );
}
